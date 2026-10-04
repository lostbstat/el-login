"""Train next-month bill forecasters (Ridge + Random Forest + XGBoost + LightGBM + CatBoost).

Run locally (not part of the deployed app):

    pip install pandas scikit-learn xgboost lightgbm catboost
    python model.py                          # uses Dataset_Elec.csv in the current folder
    python model.py path/to/other.csv        # or give a path
    python model.py --inject script.js       # also paste the result into script.js

Dataset_Elec.csv layout (60,000 rows = 1,000 households x 60 months, stored one
household after another with no household id column, months in Buddhist Era):

    billing_month,kWh,total_baht,total_per_kWh
    2564-09,213,849.29,3.9873

Idea
----
Bills depend on (a) how big the household is and (b) which calendar month it is.
Every model sees the last k bills divided by their own average (household size drops
out) plus the calendar month of the month being forecast, and predicts

    next_bill = average_of_last_k_bills * ratio

* Ridge: one small linear model for every k = 1..12 and horizon h = 1..3.
* Random Forest / XGBoost / LightGBM / CatBoost: ONE model per horizon that works for
  any history length. Features = 12 ratio slots (slots beyond k are filled with 1.0),
  k, target calendar month (1-12) and the average bill. The training set contains
  every k (1..12) so the model learns to cope with short histories.

All models are exported as plain numbers into model.json, so the web page runs them
in JavaScript (script.js) and needs no Python at run time. The page then back-tests
every model on the bills the user uploads and uses the best one.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge

K_MAX = 12
MODELS = ("ridge", "rf", "xgb", "lgbm", "cat")
# Feature layout for the tree models: [ratio_0..ratio_11, k, month(1-12), avg]
F_K, F_MONTH, F_AVG = K_MAX, K_MAX + 1, K_MAX + 2


def parse_month(col):
    """'2564-09' (Buddhist Era) or '2021-09' -> Timestamp. Falls back to pandas."""
    parts = col.astype(str).str.extract(r"^\s*(\d{4})[-/](\d{1,2})")
    year = pd.to_numeric(parts[0], errors="coerce")
    month = pd.to_numeric(parts[1], errors="coerce")
    year = year.where(year < 2400, year - 543)  # Buddhist Era -> Gregorian
    out = pd.to_datetime(dict(year=year, month=month, day=1), errors="coerce")
    return out if out.notna().any() else pd.to_datetime(col, errors="coerce")


# --------------------------------------------------------------------------- features
def tree_features(lags, k, tgt_month):
    """lags: (n, K_MAX) newest first, first k columns valid. k: int or (n,) array."""
    n = len(lags)
    kk = np.full(n, k) if np.isscalar(k) else np.asarray(k)
    mask = np.arange(K_MAX)[None, :] < kk[:, None]
    window = np.where(mask, lags, 0.0)
    avg = window.sum(axis=1) / kk
    ratios = np.where(mask, lags / avg[:, None], 1.0)
    return np.column_stack([ratios, kk, tgt_month, avg]), avg


# --------------------------------------------------------------------------- tree export
def r6(x):
    return float(f"{float(x):.6g}")


def pack_nodes(feat, thr, left, right, leaf_val, is_leaf):
    """Flat arrays: leaf -> f=-1, t=value; split -> f=feature, t=threshold, l/r=children."""
    f, t, l, r = [], [], [], []
    for i in range(len(feat)):
        if is_leaf[i]:
            f.append(-1); t.append(r6(leaf_val[i])); l.append(0); r.append(0)
        else:
            f.append(int(feat[i])); t.append(r6(thr[i])); l.append(int(left[i])); r.append(int(right[i]))
    return {"f": f, "t": t, "l": l, "r": r}


def export_rf(m):
    trees = []
    for est in m.estimators_:
        tr = est.tree_
        leaf = tr.children_left == -1
        trees.append(pack_nodes(tr.feature, tr.threshold, tr.children_left, tr.children_right, tr.value[:, 0, 0], leaf))
    return {"kind": "split", "lt": False, "bias": 0.0, "scale": 1.0 / len(trees), "trees": trees}


def _flatten(node, get_children, out):
    idx = len(out)
    out.append(node)
    for ch in get_children(node):
        _flatten(ch, get_children, out)
    return idx


def export_xgb(m):
    booster = m.get_booster()
    cfg = json.loads(booster.save_config())
    base = float(str(cfg["learner"]["learner_model_param"]["base_score"]).strip("[]"))
    trees = []
    for s in booster.get_dump(dump_format="json"):
        root = json.loads(s)
        by_id, stack = {}, [root]
        while stack:
            nd = stack.pop()
            by_id[nd["nodeid"]] = nd
            stack.extend(nd.get("children", []))
        ids = sorted(by_id)
        pos = {nid: i for i, nid in enumerate(ids)}
        feat, thr, left, right, val, leaf = [], [], [], [], [], []
        for nid in ids:
            nd = by_id[nid]
            if "leaf" in nd:
                feat.append(-1); thr.append(0); left.append(0); right.append(0); val.append(nd["leaf"]); leaf.append(True)
            else:
                feat.append(int(nd["split"][1:])); thr.append(nd["split_condition"])
                left.append(pos[nd["yes"]]); right.append(pos[nd["no"]]); val.append(0); leaf.append(False)
        trees.append(pack_nodes(feat, thr, left, right, val, leaf))
    return {"kind": "split", "lt": True, "bias": r6(base), "scale": 1.0, "trees": trees}


def export_lgbm(m):
    trees = []
    for info in m.booster_.dump_model()["tree_info"]:
        nodes = []

        def kids(nd):
            return [nd["left_child"], nd["right_child"]] if "split_feature" in nd else []

        _flatten(info["tree_structure"], kids, nodes)
        # pre-order flatten: find index of every node object
        index = {id(nd): i for i, nd in enumerate(nodes)}
        feat, thr, left, right, val, leaf = [], [], [], [], [], []
        for nd in nodes:
            if "split_feature" in nd:
                assert nd["decision_type"] == "<="
                feat.append(nd["split_feature"]); thr.append(nd["threshold"])
                left.append(index[id(nd["left_child"])]); right.append(index[id(nd["right_child"])])
                val.append(0); leaf.append(False)
            else:
                feat.append(-1); thr.append(0); left.append(0); right.append(0); val.append(nd["leaf_value"]); leaf.append(True)
        trees.append(pack_nodes(feat, thr, left, right, val, leaf))
    return {"kind": "split", "lt": False, "bias": 0.0, "scale": 1.0, "trees": trees}


def export_cat(m, tmp="/tmp/_cat_model.json"):
    m.save_model(tmp, format="json")
    data = json.load(open(tmp, encoding="utf-8"))
    scale, bias = data.get("scale_and_bias", [1.0, [0.0]])[0], data.get("scale_and_bias", [1.0, [0.0]])[1]
    bias = bias[0] if isinstance(bias, list) else bias
    feats = data["features_info"]["float_features"]
    flat_of = {ff["feature_index"]: ff["flat_feature_index"] for ff in feats}
    trees = []
    for tr in data["oblivious_trees"]:
        splits = tr["splits"]  # listed from the deepest level to the root; bit i = level i
        trees.append({
            "f": [flat_of[s["float_feature_index"]] for s in splits],
            "b": [r6(s["border"]) for s in splits],
            "v": [r6(v) for v in tr["leaf_values"]],
        })
    return {"kind": "obl", "bias": r6(bias), "scale": r6(scale), "trees": trees}


# --------------------------------------------------------------------------- reference predictor (mirrors script.js)
def predict_exported(ens, X):
    out = np.full(len(X), float(ens["bias"]))
    acc = np.zeros(len(X))
    for tr in ens["trees"]:
        if ens["kind"] == "split":
            f, t, l, r = tr["f"], tr["t"], tr["l"], tr["r"]
            for n, x in enumerate(X):
                i = 0
                while f[i] >= 0:
                    v = x[f[i]]
                    go_left = v < t[i] if ens["lt"] else v <= t[i]
                    i = l[i] if go_left else r[i]
                acc[n] += t[i]
        else:
            for n, x in enumerate(X):
                idx = 0
                for d, (fi, b) in enumerate(zip(tr["f"], tr["b"])):
                    if x[fi] > b:
                        idx |= 1 << d
                acc[n] += tr["v"][idx]
    return out + ens["scale"] * acc


# --------------------------------------------------------------------------- model factories
def make_model(name, p):
    if name == "rf":
        return RandomForestRegressor(n_estimators=p["rf_trees"], max_depth=p["rf_depth"], min_samples_leaf=p["rf_leaf"],
                                     max_features=0.6, n_jobs=-1, random_state=0)
    if name == "xgb":
        from xgboost import XGBRegressor
        return XGBRegressor(n_estimators=p["xgb_trees"], max_depth=p["xgb_depth"], learning_rate=0.1, subsample=0.8,
                            colsample_bytree=0.8, min_child_weight=50, tree_method="hist", n_jobs=-1, random_state=0)
    if name == "lgbm":
        from lightgbm import LGBMRegressor
        return LGBMRegressor(n_estimators=p["lgbm_trees"], num_leaves=p["lgbm_leaves"], learning_rate=0.1, subsample=0.8,
                             subsample_freq=1, colsample_bytree=0.8, min_child_samples=100, n_jobs=-1, random_state=0,
                             verbose=-1)
    if name == "cat":
        from catboost import CatBoostRegressor
        return CatBoostRegressor(iterations=p["cat_trees"], depth=p["cat_depth"], learning_rate=0.1, random_seed=0,
                                 verbose=False, thread_count=-1, allow_writing_files=False)
    raise ValueError(name)


EXPORT = {"rf": export_rf, "xgb": export_xgb, "lgbm": export_lgbm, "cat": export_cat}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", nargs="?", default="Dataset_Elec.csv", help="training CSV (default: Dataset_Elec.csv)")
    ap.add_argument("--target", default="total_baht", help="column to forecast (default: total_baht)")
    ap.add_argument("--date", default="billing_month", help="month column (default: billing_month)")
    ap.add_argument("--group", default="", help="optional household id column")
    ap.add_argument("--group-size", type=int, default=60,
                    help="rows per household when there is no --group column (default: 60; 0 = one household)")
    ap.add_argument("--horizons", type=int, default=3, help="months ahead to forecast (default: 3)")
    ap.add_argument("--alpha", type=float, default=1.0, help="Ridge strength (default: 1.0)")
    ap.add_argument("--test-frac", type=float, default=0.2, help="share of newest months held out (default: 0.2)")
    ap.add_argument("--draws", type=int, default=2, help="random history lengths per row for the tree models (default: 2)")
    ap.add_argument("--rf-trees", type=int, default=30)
    ap.add_argument("--rf-depth", type=int, default=6)
    ap.add_argument("--rf-leaf", type=int, default=300)
    ap.add_argument("--xgb-trees", type=int, default=120)
    ap.add_argument("--xgb-depth", type=int, default=3)
    ap.add_argument("--lgbm-trees", type=int, default=120)
    ap.add_argument("--lgbm-leaves", type=int, default=8)
    ap.add_argument("--cat-trees", type=int, default=150)
    ap.add_argument("--cat-depth", type=int, default=5)
    ap.add_argument("--out", default="model.json", help="output file (default: model.json)")
    ap.add_argument("--inject", default="", help="script.js to update in place (replaces the FORECAST_MODEL line)")
    args = ap.parse_args()
    P = {k.replace("-", "_"): v for k, v in vars(args).items()}

    raw = pd.read_csv(args.csv, encoding="utf-8-sig")
    missing = [c for c in (args.target, args.date, *([args.group] if args.group else [])) if c not in raw.columns]
    if missing:
        sys.exit(f"Missing columns in CSV: {missing}\nAvailable: {list(raw.columns)}")
    raw[args.target] = pd.to_numeric(raw[args.target], errors="coerce")

    group_col = args.group or None
    if not group_col and args.group_size > 0:
        raw["_household"] = np.arange(len(raw)) // args.group_size
        group_col = "_household"
        print(f"no --group given: every {args.group_size} consecutive rows = one household "
              f"({raw['_household'].nunique()} households)")
    if not group_col:
        raw["_household"] = 0
        group_col = "_household"

    raw[args.date] = parse_month(raw[args.date])
    df = raw.dropna(subset=[args.date, args.target]).sort_values([group_col, args.date]).reset_index(drop=True)
    g = df.groupby(group_col)

    K, H = K_MAX, args.horizons
    lags = np.column_stack([g[args.target].shift(j).to_numpy() for j in range(1, K + 1)])  # col 0 = newest
    avail = (~np.isnan(lags)).cumprod(axis=1).sum(axis=1)  # number of leading valid lags
    months = np.sort(df[args.date].unique())
    if len(months) < 6:
        sys.exit("Need at least 6 distinct months of data.")
    cut = months[-max(1, int(len(months) * args.test_frac))]
    rng = np.random.default_rng(0)

    ridge_models, mae = {}, {m: {} for m in MODELS}
    trees = {m: {} for m in MODELS if m != "ridge"}
    sizes = {}

    for h in range(1, H + 1):
        t0 = time.time()
        tgt = g[args.target].shift(-(h - 1)).to_numpy()
        tgt_date = g[args.date].shift(-(h - 1))
        tgt_month = tgt_date.dt.month.to_numpy()
        is_test = (tgt_date >= cut).to_numpy()
        base_ok = ~np.isnan(tgt) & ~pd.isna(tgt_month) & (avail >= 1)

        # ---------------- Ridge (one model per k) ----------------
        ridge_models[str(h)] = {}
        for k in range(1, K + 1):
            window = lags[:, :k]
            avg = window.mean(axis=1)
            ok = ~np.isnan(window).any(axis=1) & base_ok & (avg > 0)
            if ok.sum() < 200:
                continue
            ratio_in = window[ok] / avg[ok, None]
            dummies = (tgt_month[ok, None] == np.arange(2, 13)).astype(float)  # Jan is the baseline
            X, y = np.hstack([ratio_in, dummies]), tgt[ok] / avg[ok]
            te, tr = is_test[ok], ~is_test[ok]
            if te.sum() == 0 or tr.sum() == 0:
                continue
            pred = Ridge(alpha=args.alpha).fit(X[tr], y[tr]).predict(X[te]) * avg[ok][te]
            mae["ridge"][f"h{h}_k{k}"] = round(float(np.mean(np.abs(pred - tgt[ok][te]))), 2)
            final = Ridge(alpha=args.alpha).fit(X, y)
            ridge_models[str(h)][str(k)] = {
                "intercept": round(float(final.intercept_), 6),
                "coef": [round(float(c), 6) for c in final.coef_[:k]],
                "month": [0.0] + [round(float(c), 6) for c in final.coef_[k:]],
            }

        # ---------------- tree models (one model per horizon, any k) ----------------
        ok = base_ok & (lags[:, 0] > 0) & ~np.isnan(lags[:, 0])
        idx_all = np.flatnonzero(ok)
        idx_rep = np.repeat(idx_all, args.draws)
        kk = rng.integers(1, avail[idx_rep] + 1)  # uniform k in 1..available lags
        keep = ~np.isnan(np.where(np.arange(K)[None, :] < kk[:, None], lags[idx_rep], 0.0)).any(axis=1)
        idx_rep, kk = idx_rep[keep], kk[keep]
        Xall, avg_all = tree_features(lags[idx_rep], kk, tgt_month[idx_rep])
        good = avg_all > 0
        Xall, kk, idx_rep, avg_all = Xall[good], kk[good], idx_rep[good], avg_all[good]
        yall = tgt[idx_rep] / avg_all
        tr_mask = ~is_test[idx_rep]

        # fixed-k evaluation sets (test rows)
        evalsets = {}
        for k in range(1, K + 1):
            sel = np.flatnonzero(ok & is_test & (avail >= k))
            if len(sel) == 0:
                continue
            Xk, avgk = tree_features(lags[sel], k, tgt_month[sel])
            ok2 = avgk > 0
            evalsets[k] = (Xk[ok2], avgk[ok2], tgt[sel][ok2])

        for name in ("rf", "xgb", "lgbm", "cat"):
            mdl = make_model(name, P)
            mdl.fit(Xall[tr_mask], yall[tr_mask])
            for k, (Xk, avgk, tk) in evalsets.items():
                mae[name][f"h{h}_k{k}"] = round(float(np.mean(np.abs(mdl.predict(Xk) * avgk - tk))), 2)
            final = make_model(name, P)
            final.fit(Xall, yall)
            ens = EXPORT[name](final)
            # parity check: exported JSON must reproduce the library's predictions
            probe = Xall[rng.choice(len(Xall), 300, replace=False)]
            diff = float(np.max(np.abs(predict_exported(ens, probe) - final.predict(probe))))
            if diff > 0.02:
                sys.exit(f"export mismatch for {name} h={h}: max diff {diff:.4f}")
            trees[name][str(h)] = ens
            sizes[(name, h)] = diff
        print(f"h={h}: trained all models in {time.time() - t0:.0f}s ({len(Xall):,} rows)")

    # ---------------- report ----------------
    print(f"\nTest MAE in {args.target} units (newest {int(args.test_frac * 100)}% of months held out), h=1")
    print("  k  | " + " | ".join(f"{m:>6}" for m in MODELS) + " | last")
    for k in (1, 2, 3, 6, 9, 12):
        cells = [f"{mae[m].get(f'h1_k{k}', float('nan')):6.1f}" for m in MODELS]
        print(f" {k:2d}  | " + " | ".join(cells))
    print("\nOverall mean test MAE (h=1, all k):")
    for m in MODELS:
        vals = [v for key, v in mae[m].items() if key.startswith("h1_")]
        print(f"  {m:6s} {np.mean(vals):7.2f}")
    print("\nexport parity max |diff| (ratio units):", {f"{a}-h{h}": round(d, 5) for (a, h), d in sizes.items()})

    out = {
        "target": args.target, "form": "ratio_month", "max_lags": K, "horizons": H,
        "month_index": "0=Jan..11=Dec",
        "models": ridge_models,                         # Ridge (kept for compatibility)
        "mae_test": mae["ridge"],                       # Ridge test MAE (kept for compatibility)
        "tree_features": "ratio_0..ratio_11 (1.0 when beyond k), k, month(1-12), avg",
        "trees": trees,                                 # rf / xgb / lgbm / cat, keyed by horizon
        "mae_models": mae,                              # test MAE for every model, keys h{h}_k{k}
        "target_mean": round(float(df[args.target].mean()), 2),  # lets the page compare errors as a % of the bill
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    size = len(json.dumps(out, separators=(",", ":")).encode("utf-8"))
    print(f"\nSaved {args.out} ({size / 1024:.0f} KB)")

    if args.inject:
        src = open(args.inject, encoding="utf-8").read()
        line = "const FORECAST_MODEL=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";"
        new, n = re.subn(r"^const FORECAST_MODEL=.*;[ \t]*$", lambda _m: line, src, count=1, flags=re.M)
        if n != 1:
            sys.exit("could not find the 'const FORECAST_MODEL=...;' line in " + args.inject)
        open(args.inject, "w", encoding="utf-8").write(new)
        print(f"Updated {args.inject}")


if __name__ == "__main__":
    main()
