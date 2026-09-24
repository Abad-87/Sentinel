import os
import sys
import time
from datetime import datetime
from typing import List, Dict, Any, Union, Optional
import numpy as np
import pandas as pd

# Headless matplotlib configuration
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

try:
    import seaborn as sns
except ImportError:
    sns = None

# Set chart styling
plt.style.use('ggplot')

# Base paths
MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
# Determine project root (if module is in backend/, root is parent; otherwise module dir)
if os.path.basename(MODULE_DIR).lower() == 'backend':
    ROOT_DIR = os.path.abspath(os.path.join(MODULE_DIR, '..'))
else:
    ROOT_DIR = MODULE_DIR

IS_VERCEL = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
if IS_VERCEL:
    DEFAULT_OUTPUT_DIR = os.path.join("/tmp", "Outputs")
    FRONTEND_OUTPUT_DIR = os.path.join("/tmp", "frontend_outputs")
    DATA_FOLDER = os.path.join("/tmp", "Data")
else:
    DEFAULT_OUTPUT_DIR = os.path.join(ROOT_DIR, 'Outputs')
    FRONTEND_OUTPUT_DIR = os.path.join(ROOT_DIR, 'frontend', 'public', 'outputs')
    DATA_FOLDER = os.path.join(ROOT_DIR, 'Data')


def get_output_dirs(custom_dirs: Optional[Union[str, List[str]]] = None) -> List[str]:
    """
    Resolves and creates output directory paths for generated chart artifacts.
    """
    if custom_dirs:
        dirs = [custom_dirs] if isinstance(custom_dirs, str) else list(custom_dirs)
    else:
        dirs = [DEFAULT_OUTPUT_DIR, FRONTEND_OUTPUT_DIR]

    resolved = []
    for d in dirs:
        if d:
            try:
                os.makedirs(d, exist_ok=True)
                resolved.append(d)
            except OSError:
                pass
    return resolved


def standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Standardizes column names across diverse incoming schemas (case, whitespace, underscores).
    Derives isFraud from risk or fraudProbability flags if not explicitly provided.
    """
    work_df = df.copy()
    col_rename = {}
    for c in work_df.columns:
        cl = str(c).strip().lower().replace('_', '').replace(' ', '')
        if cl in ['step', 'time', 'hour']:
            col_rename[c] = 'step'
        elif cl in ['type', 'transactiontype', 'action']:
            col_rename[c] = 'type'
        elif cl in ['amount', 'value', 'transactionamount']:
            col_rename[c] = 'amount'
        elif cl in ['isfraud', 'fraud']:
            col_rename[c] = 'isFraud'
        elif cl in ['oldbalanceorg', 'oldbalanceorig', 'initialbalance', 'oldbalance']:
            col_rename[c] = 'oldbalanceOrg'
        elif cl in ['newbalanceorig', 'newbalanceorg', 'finalbalance', 'newbalance']:
            col_rename[c] = 'newbalanceOrig'
        elif cl in ['newbalancedest', 'recipientnewbalance', 'destnewbalance']:
            col_rename[c] = 'newbalanceDest'
        elif cl in ['oldbalancedest', 'destoldbalance', 'recipientoldbalance']:
            col_rename[c] = 'oldbalanceDest'
        elif cl in ['merchantcategory', 'category', 'merchantcat']:
            col_rename[c] = 'merchant_category'
        elif cl in ['cardtype', 'card']:
            col_rename[c] = 'card_type'
        elif cl in ['cardpresent', 'present']:
            col_rename[c] = 'card_present'
        elif cl in ['distancefromhome', 'distance']:
            col_rename[c] = 'distance_from_home'
        elif cl in ['sender', 'nameorig', 'from', 'source']:
            col_rename[c] = 'sender'
        elif cl in ['recipient', 'namedest', 'to', 'destination']:
            col_rename[c] = 'recipient'
        elif cl in ['id', 'txnid', 'transactionid']:
            col_rename[c] = 'id'

    work_df = work_df.rename(columns=col_rename)

    # Derive isFraud flag if absent
    if 'isFraud' not in work_df.columns:
        if 'risk' in work_df.columns:
            work_df['isFraud'] = (work_df['risk'] == 'High Risk').astype(int)
        elif 'status' in work_df.columns:
            work_df['isFraud'] = (work_df['status'] == 'Blocked').astype(int)
        elif 'fraudProbability' in work_df.columns:
            work_df['isFraud'] = (pd.to_numeric(work_df['fraudProbability'], errors='coerce') >= 70).astype(int)
        elif 'is_fraud' in work_df.columns:
            work_df['isFraud'] = pd.to_numeric(work_df['is_fraud'], errors='coerce').fillna(0).astype(int)
        else:
            work_df['isFraud'] = 0
    else:
        work_df['isFraud'] = pd.to_numeric(work_df['isFraud'], errors='coerce').fillna(0).astype(int)

    return work_df


# ==============================================================================
# 1. TRANSACTION SUMMARY & KPI ANALYTICS
# ==============================================================================

def get_transaction_summary(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Computes high-level transaction KPIs and statistics from a DataFrame.
    Returns both snake_case and camelCase keys for seamless backend/frontend compatibility.
    """
    if df is None or len(df) == 0:
        return {
            "total_scanned": 0, "totalScanned": 0,
            "high_risk_count": 0, "highRiskCount": 0,
            "medium_risk_count": 0, "mediumRiskCount": 0,
            "low_risk_count": 0, "lowRiskCount": 0,
            "fraud_rate": 0.0, "fraudRate": 0.0,
            "total_volume": 0.0, "totalVolume": 0.0,
            "flagged_volume": 0.0, "flaggedVolume": 0.0,
            "blocked_count": 0, "blockedCount": 0,
            "under_review_count": 0, "underReviewCount": 0,
            "approved_count": 0, "approvedCount": 0
        }

    work_df = standardize_columns(df)
    total_scanned = len(work_df)

    # Determine risk counts
    if 'risk' in work_df.columns:
        high_risk = int((work_df['risk'] == 'High Risk').sum())
        med_risk = int((work_df['risk'] == 'Medium Risk').sum())
        low_risk = int((work_df['risk'] == 'Low Risk').sum())
    else:
        high_risk = int((work_df['isFraud'] == 1).sum())
        med_risk = 0
        low_risk = total_scanned - high_risk

    # Determine status counts
    if 'status' in work_df.columns:
        blocked = int((work_df['status'] == 'Blocked').sum())
        under_review = int((work_df['status'] == 'Under Review').sum())
        approved = int((work_df['status'] == 'Approved').sum())
    else:
        blocked = high_risk
        under_review = med_risk
        approved = low_risk

    # Volume calculations
    if 'amount' in work_df.columns:
        numeric_amt = pd.to_numeric(work_df['amount'], errors='coerce').fillna(0.0)
        total_volume = round(float(numeric_amt.sum()), 2)
        if 'risk' in work_df.columns:
            flagged_mask = work_df['risk'] == 'High Risk'
        else:
            flagged_mask = work_df['isFraud'] == 1
        flagged_volume = round(float(numeric_amt[flagged_mask].sum()), 2)
    else:
        total_volume = 0.0
        flagged_volume = 0.0

    fraud_rate = round((high_risk / total_scanned) * 100, 2) if total_scanned > 0 else 0.0

    return {
        "total_scanned": total_scanned,
        "totalScanned": total_scanned,
        "high_risk_count": high_risk,
        "highRiskCount": high_risk,
        "medium_risk_count": med_risk,
        "mediumRiskCount": med_risk,
        "low_risk_count": low_risk,
        "lowRiskCount": low_risk,
        "fraud_rate": fraud_rate,
        "fraudRate": fraud_rate,
        "total_volume": total_volume,
        "totalVolume": total_volume,
        "flagged_volume": flagged_volume,
        "flaggedVolume": flagged_volume,
        "blocked_count": blocked,
        "blockedCount": blocked,
        "under_review_count": under_review,
        "underReviewCount": under_review,
        "approved_count": approved,
        "approvedCount": approved
    }


# ==============================================================================
# 2. MERCHANT CATEGORY & CREDIT CARD ANALYTICS
# ==============================================================================

def get_merchant_category_analytics(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Computes aggregated fraud statistics grouped by merchant category.
    """
    work_df = standardize_columns(df)
    if 'merchant_category' not in work_df.columns:
        return []

    group = work_df.groupby('merchant_category', observed=False).agg(
        total_tx=('isFraud', 'count'),
        fraud_tx=('isFraud', 'sum')
    ).reset_index()

    group['fraud_rate_pct'] = (group['fraud_tx'] / np.maximum(1, group['total_tx'])) * 100
    group = group.sort_values('fraud_rate_pct', ascending=False)

    return group.to_dict(orient='records')


def get_credit_card_analytics(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Analyzes credit card / synthetic fraud patterns including merchant categories,
    card-present vs CNP, and distance metrics.
    """
    work_df = standardize_columns(df)
    analytics = {}

    # Merchant Category Analytics
    if 'merchant_category' in work_df.columns:
        analytics['merchant_categories'] = get_merchant_category_analytics(work_df)

    # Card Present vs CNP
    if 'card_present' in work_df.columns:
        card_cols = ['card_present']
        if 'card_type' in work_df.columns:
            card_cols.insert(0, 'card_type')

        card_group = work_df.groupby(card_cols, observed=False).agg(
            total_tx=('isFraud', 'count'),
            fraud_tx=('isFraud', 'sum')
        ).reset_index()
        card_group['fraud_rate_pct'] = (card_group['fraud_tx'] / np.maximum(1, card_group['total_tx'])) * 100
        analytics['card_modes'] = card_group.to_dict(orient='records')

    # Distance metrics
    if 'distance_from_home' in work_df.columns:
        dist = pd.to_numeric(work_df['distance_from_home'], errors='coerce')
        fraud_mask = work_df['isFraud'] == 1
        analytics['distance_metrics'] = {
            "fraud_mean_distance": float(dist[fraud_mask].mean()) if fraud_mask.any() else 0.0,
            "fraud_median_distance": float(dist[fraud_mask].median()) if fraud_mask.any() else 0.0,
            "legit_mean_distance": float(dist[~fraud_mask].mean()) if (~fraud_mask).any() else 0.0,
            "legit_median_distance": float(dist[~fraud_mask].median()) if (~fraud_mask).any() else 0.0
        }

    # Summary
    analytics['summary'] = get_transaction_summary(work_df)
    return analytics


# ==============================================================================
# 3. ONLINE FRAUD CHART GENERATION
# ==============================================================================

def generate_online_fraud_charts(df: pd.DataFrame, output_dirs: Optional[Union[str, List[str]]] = None) -> List[str]:
    """
    Generates the 5 canonical online fraud charts and saves them to designated directories:
    1. Transaction_types.png
    2. Fraud_rate_by_type.png
    3. Hourly_fraud_trend.png (Standardized: hour_of_day = (step - 1) % 24)
    4. Balance_correlation_heatmap.png
    5. Amount_distribution.png
    """
    dirs = get_output_dirs(output_dirs)
    work_df = standardize_columns(df)
    generated = []

    # Standardize step & hour: ALWAYS (step - 1) % 24
    if 'step' in work_df.columns:
        work_df['step'] = pd.to_numeric(work_df['step'], errors='coerce').fillna(1).astype(int)
        work_df['hour_of_day'] = (work_df['step'] - 1) % 24
    else:
        work_df['step'] = 1
        work_df['hour_of_day'] = 0

    if 'amount' in work_df.columns:
        work_df['amount'] = pd.to_numeric(work_df['amount'], errors='coerce').fillna(0.0).clip(lower=0)

    # --------------------------------------------------------------------------
    # CHART 1: Total Transactions by Type
    # --------------------------------------------------------------------------
    if 'type' in work_df.columns:
        try:
            type_data = work_df.groupby('type', observed=False).agg(
                total_tx=('isFraud', 'count'),
                fraud_tx=('isFraud', 'sum')
            ).reset_index()
            type_data['fraud_rate_pct'] = (type_data['fraud_tx'] / np.maximum(1, type_data['total_tx'])) * 100

            plt.figure(figsize=(8, 5))
            sns.barplot(data=type_data, x='type', y='total_tx', hue='type', palette='Blues_d', legend=False)
            if (type_data['total_tx'] > 0).any():
                plt.yscale('log')
            plt.title('Total Transactions by Type (Log Scale)')
            plt.xlabel('Transaction Type')
            plt.ylabel('Total Transactions (Log Scale)')
            for index, row in type_data.iterrows():
                plt.text(index, max(1, row['total_tx']), f"{int(row['total_tx']):,}", ha='center', va='bottom', fontsize=8)
            plt.tight_layout()
            for d in dirs:
                plt.savefig(os.path.join(d, 'Transaction_types.png'), dpi=200)
            plt.close()
            generated.append('Transaction_types.png')
        except Exception as e:
            print("Error generating Transaction_types.png:", e)
            plt.close()

        # ----------------------------------------------------------------------
        # CHART 2: Fraud Rate by Transaction Type
        # ----------------------------------------------------------------------
        try:
            plt.figure(figsize=(8, 5))
            sns.barplot(data=type_data, x='type', y='fraud_rate_pct', hue='type', palette='Reds_d', legend=False)
            plt.title('Fraud Rate by Transaction Type')
            plt.xlabel('Transaction Type')
            plt.ylabel('Fraud Rate (%)')
            for index, row in type_data.iterrows():
                if row['fraud_rate_pct'] > 0:
                    plt.text(index, row['fraud_rate_pct'], f"{row['fraud_rate_pct']:.2f}%", ha='center', va='bottom', fontsize=9)
            plt.tight_layout()
            for d in dirs:
                plt.savefig(os.path.join(d, 'Fraud_rate_by_type.png'), dpi=200)
            plt.close()
            generated.append('Fraud_rate_by_type.png')
        except Exception as e:
            print("Error generating Fraud_rate_by_type.png:", e)
            plt.close()

    # --------------------------------------------------------------------------
    # CHART 3: Hourly Fraud Trend - 24 Hr Cycle (hour_of_day = (step - 1) % 24)
    # --------------------------------------------------------------------------
    try:
        hourly_data = work_df.groupby('hour_of_day').agg(
            total_tx=('isFraud', 'count'),
            fraud_tx=('isFraud', 'sum')
        ).reset_index()

        full_hours = pd.DataFrame({'hour_of_day': range(24)})
        hourly_data = full_hours.merge(hourly_data, on='hour_of_day', how='left').fillna(0)

        plt.figure(figsize=(9, 5))
        plt.plot(hourly_data['hour_of_day'], hourly_data['fraud_tx'], marker='o', color='red', linewidth=2)
        plt.title('Fraud Cases by Hour of Day (0 to 23)')
        plt.xlabel('Hour of Day (24-Hour Format: (step - 1) % 24)')
        plt.ylabel('Number of Fraud Cases')
        plt.xticks(range(0, 24))
        plt.grid(True)
        plt.tight_layout()
        for d in dirs:
            plt.savefig(os.path.join(d, 'Hourly_fraud_trend.png'), dpi=200)
        plt.close()
        generated.append('Hourly_fraud_trend.png')
    except Exception as e:
        print("Error generating Hourly_fraud_trend.png:", e)
        plt.close()

    # --------------------------------------------------------------------------
    # CHART 4: Feature Correlation Heatmap
    # --------------------------------------------------------------------------
    num_candidates = ['amount', 'oldbalanceOrg', 'newbalanceOrig', 'oldbalanceDest', 'newbalanceDest', 'isFraud']
    avail_num_cols = [c for c in num_candidates if c in work_df.columns]
    if len(avail_num_cols) >= 2:
        try:
            corr_matrix = work_df[avail_num_cols].apply(pd.to_numeric, errors='coerce').fillna(0).corr()
            plt.figure(figsize=(8, 6))
            sns.heatmap(corr_matrix, annot=True, fmt='.2f', cmap='coolwarm', vmin=-1, vmax=1)
            plt.title('Feature Correlation Heatmap')
            plt.tight_layout()
            for d in dirs:
                plt.savefig(os.path.join(d, 'Balance_correlation_heatmap.png'), dpi=200)
            plt.close()
            generated.append('Balance_correlation_heatmap.png')
        except Exception as e:
            print("Error generating Balance_correlation_heatmap.png:", e)
            plt.close()

    # --------------------------------------------------------------------------
    # CHART 5: Amount Distribution - Fraud vs Legit (Log Scale)
    # --------------------------------------------------------------------------
    if 'amount' in work_df.columns and len(work_df) > 1:
        try:
            work_df['log_amount'] = np.log1p(work_df['amount'])
            unique_fraud = work_df['isFraud'].nunique()
            hist_palette = ['skyblue', 'red'] if unique_fraud > 1 else (['red'] if (work_df['isFraud'] == 1).any() else ['skyblue'])
            plt.figure(figsize=(8, 5))
            sns.histplot(
                data=work_df, x='log_amount', hue='isFraud', kde=True,
                palette=hist_palette, element='step', stat='density', common_norm=False
            )
            plt.title('Transaction Amount Distribution: Fraud vs Legit (Log Scale)')
            plt.xlabel('Log(Amount + 1)')
            plt.ylabel('Density')
            plt.tight_layout()
            for d in dirs:
                plt.savefig(os.path.join(d, 'Amount_distribution.png'), dpi=200)
            plt.close()
            generated.append('Amount_distribution.png')
        except Exception as e:
            print("Error generating Amount_distribution.png:", e)
            plt.close()

    return generated


# ==============================================================================
# 4. CREDIT CARD / SYNTHETIC FRAUD CHART GENERATION
# ==============================================================================

def generate_credit_card_charts(df: pd.DataFrame, output_dirs: Optional[Union[str, List[str]]] = None) -> List[str]:
    """
    Generates the 5 credit card / synthetic fraud charts and saves them to designated directories:
    1. Merchant_category_fraud.png
    2. Card_present_vs_cnp.png
    3. Distance_from_home_boxplot.png
    4. Distance_distribution.png
    5. Card_amount_distribution.png
    """
    dirs = get_output_dirs(output_dirs)
    work_df = standardize_columns(df)
    generated = []

    # --------------------------------------------------------------------------
    # CHART 6: Merchant Category Fraud Rate
    # --------------------------------------------------------------------------
    if 'merchant_category' in work_df.columns:
        try:
            merchant_data = work_df.groupby('merchant_category', observed=False).agg(
                total_tx=('isFraud', 'count'),
                fraud_tx=('isFraud', 'sum')
            ).reset_index()
            merchant_data['fraud_rate_pct'] = (merchant_data['fraud_tx'] / np.maximum(1, merchant_data['total_tx'])) * 100
            merchant_data = merchant_data.sort_values('fraud_rate_pct', ascending=False)

            plt.figure(figsize=(9, 5))
            sns.barplot(
                data=merchant_data, x='merchant_category', y='fraud_rate_pct',
                hue='merchant_category', palette='Reds_r', legend=False
            )
            plt.title('Fraud Rate (%) Across Merchant Categories')
            plt.xlabel('Merchant Category')
            plt.ylabel('Fraud Rate (%)')
            plt.xticks(rotation=40, ha='right')
            plt.tight_layout()
            for d in dirs:
                plt.savefig(os.path.join(d, 'Merchant_category_fraud.png'), dpi=200)
            plt.close()
            generated.append('Merchant_category_fraud.png')
        except Exception as e:
            print("Error generating Merchant_category_fraud.png:", e)
            plt.close()

    # --------------------------------------------------------------------------
    # CHART 7: Card Present vs Card Not Present (CNP) Fraud Rate
    # --------------------------------------------------------------------------
    if 'card_present' in work_df.columns:
        try:
            group_cols = ['card_present']
            if 'card_type' in work_df.columns:
                group_cols.insert(0, 'card_type')
                x_col = 'card_type'
            else:
                x_col = 'card_present'

            card_data = work_df.groupby(group_cols, observed=False).agg(
                total_tx=('isFraud', 'count'),
                fraud_tx=('isFraud', 'sum')
            ).reset_index()
            card_data['fraud_rate_pct'] = (card_data['fraud_tx'] / np.maximum(1, card_data['total_tx'])) * 100
            card_data['card_present_label'] = card_data['card_present'].map(
                {True: 'Card Present', False: 'Card Not Present', 1: 'Card Present', 0: 'Card Not Present'}
            ).fillna('Unknown')

            plt.figure(figsize=(8, 5))
            sns.barplot(
                data=card_data, x=x_col, y='fraud_rate_pct',
                hue='card_present_label', palette='Set1'
            )
            plt.title('Fraud Rate by Card Type and Card Present Status')
            plt.xlabel('Card Type' if x_col == 'card_type' else 'Card Present Status')
            plt.ylabel('Fraud Rate (%)')
            plt.legend(title='Transaction Mode')
            plt.tight_layout()
            for d in dirs:
                plt.savefig(os.path.join(d, 'Card_present_vs_cnp.png'), dpi=200)
            plt.close()
            generated.append('Card_present_vs_cnp.png')
        except Exception as e:
            print("Error generating Card_present_vs_cnp.png:", e)
            plt.close()

    # --------------------------------------------------------------------------
    # CHART 8: Distance from Home Boxplot (Legit vs Fraud)
    # --------------------------------------------------------------------------
    if 'distance_from_home' in work_df.columns:
        try:
            plt.figure(figsize=(7, 5))
            sns.boxplot(
                data=work_df, x='isFraud', y='distance_from_home',
                hue='isFraud', palette='Set2', legend=False
            )
            plt.title('Distance from Home (Legitimate vs Fraudulent)')
            plt.xlabel('Is Fraud (0 = Legitimate, 1 = Fraud)')
            plt.ylabel('Distance from Home (km)')
            plt.tight_layout()
            for d in dirs:
                plt.savefig(os.path.join(d, 'Distance_from_home_boxplot.png'), dpi=200)
            plt.close()
            generated.append('Distance_from_home_boxplot.png')
        except Exception as e:
            print("Error generating Distance_from_home_boxplot.png:", e)
            plt.close()

        # ----------------------------------------------------------------------
        # CHART 9: Distance from Home Distribution
        # ----------------------------------------------------------------------
        try:
            unique_fraud = work_df['isFraud'].nunique()
            dist_palette = ['skyblue', 'red'] if unique_fraud > 1 else (['red'] if (work_df['isFraud'] == 1).any() else ['skyblue'])
            plt.figure(figsize=(8, 5))
            sns.histplot(
                data=work_df, x='distance_from_home', hue='isFraud', kde=True,
                palette=dist_palette, element='step', stat='density', common_norm=False
            )
            plt.title('Distance from Home Distribution: Fraud vs Legit')
            plt.xlabel('Distance from Home (km)')
            plt.ylabel('Density')
            plt.tight_layout()
            for d in dirs:
                plt.savefig(os.path.join(d, 'Distance_distribution.png'), dpi=200)
            plt.close()
            generated.append('Distance_distribution.png')
        except Exception as e:
            print("Error generating Distance_distribution.png:", e)
            plt.close()

    # --------------------------------------------------------------------------
    # CHART 10: Credit Card Amount Distribution
    # --------------------------------------------------------------------------
    if 'amount' in work_df.columns and len(work_df) > 1:
        try:
            unique_fraud = work_df['isFraud'].nunique()
            card_palette = ['skyblue', 'red'] if unique_fraud > 1 else (['red'] if (work_df['isFraud'] == 1).any() else ['skyblue'])
            plt.figure(figsize=(8, 5))
            sns.histplot(
                data=work_df, x='amount', hue='isFraud', kde=True,
                palette=card_palette, element='step', stat='density', common_norm=False
            )
            plt.title('Transaction Amount Distribution: Fraud vs Legit')
            plt.xlabel('Amount')
            plt.ylabel('Density')
            plt.tight_layout()
            for d in dirs:
                plt.savefig(os.path.join(d, 'Card_amount_distribution.png'), dpi=200)
            plt.close()
            generated.append('Card_amount_distribution.png')
        except Exception as e:
            print("Error generating Card_amount_distribution.png:", e)
            plt.close()

    return generated


# ==============================================================================
# 5. HIGH-LEVEL DATASET ANALYSIS ENTRYPOINTS
# ==============================================================================

def analyze_online_fraud(data: Union[pd.DataFrame, str], output_dirs: Optional[Union[str, List[str]]] = None) -> Dict[str, Any]:
    """
    Performs full online fraud statistical analysis and generates online fraud charts.
    Accepts a pandas DataFrame or path to a CSV file.
    """
    if isinstance(data, str):
        print(f"\nLoading online fraud dataset from: {data}...")
        df = pd.read_csv(data)
    elif isinstance(data, pd.DataFrame):
        df = data
    else:
        raise ValueError("analyze_online_fraud accepts a pandas DataFrame or file path string.")

    print("\n--- Online Fraud Analysis Summary ---")
    summary = get_transaction_summary(df)
    for k, v in summary.items():
        if k in ['totalScanned', 'highRiskCount', 'fraudRate', 'totalVolume', 'flaggedVolume']:
            print(f"{k}: {v}")

    charts = generate_online_fraud_charts(df, output_dirs=output_dirs)
    print(f"Generated {len(charts)} online fraud charts.")

    return {
        "summary": summary,
        "charts": charts,
        "status": "success"
    }


def analyze_synthetic_fraud(data: Union[pd.DataFrame, str], output_dirs: Optional[Union[str, List[str]]] = None) -> Dict[str, Any]:
    """
    Performs full synthetic / credit-card fraud analysis and generates credit card charts.
    Accepts a pandas DataFrame or path to a CSV file.
    """
    if isinstance(data, str):
        print(f"\nLoading synthetic fraud dataset from: {data}...")
        df = pd.read_csv(data)
    elif isinstance(data, pd.DataFrame):
        df = data
    else:
        raise ValueError("analyze_synthetic_fraud accepts a pandas DataFrame or file path string.")

    print("\n--- Synthetic Fraud Analysis Summary ---")
    analytics = get_credit_card_analytics(df)
    charts = generate_credit_card_charts(df, output_dirs=output_dirs)
    print(f"Generated {len(charts)} credit card charts.")

    return {
        "analytics": analytics,
        "charts": charts,
        "status": "success"
    }


def run_full_analysis(data_folder: str = DATA_FOLDER, output_dirs: Optional[Union[str, List[str]]] = None) -> Dict[str, Any]:
    """
    Batch script execution: analyzes available files in the Data directory.
    """
    print("\n==================================================================")
    print("Running fraud analysis at:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print("==================================================================")

    results = {}
    file1 = os.path.join(data_folder, 'onlinefraud.csv')
    file2 = os.path.join(data_folder, 'synthetic_fraud_data.csv')

    if os.path.exists(file1):
        results['online_fraud'] = analyze_online_fraud(file1, output_dirs=output_dirs)
    else:
        print(f"Dataset '{file1}' not found, skipping online fraud analysis.")

    if os.path.exists(file2):
        results['synthetic_fraud'] = analyze_synthetic_fraud(file2, output_dirs=output_dirs)
    else:
        print(f"Dataset '{file2}' not found, skipping synthetic fraud analysis.")

    print("\nAnalysis complete! Visual charts saved to output directories.")
    print("==================================================================\n")
    return results


# ==============================================================================
# 6. STANDALONE WATCHDOG FILE MONITOR (CLI ONLY)
# ==============================================================================

if __name__ == "__main__":
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler

    class DataChangeHandler(FileSystemEventHandler):
        def on_created(self, event):
            if event.src_path.endswith('.csv'):
                print("\nNew data file detected:", event.src_path)
                time.sleep(2)
                run_full_analysis()

        def on_modified(self, event):
            if event.src_path.endswith('.csv'):
                print("\nData file modified:", event.src_path)
                time.sleep(2)
                run_full_analysis()

    # Run initial analysis
    run_full_analysis()

    if os.path.exists(DATA_FOLDER):
        event_handler = DataChangeHandler()
        observer = Observer()
        observer.schedule(event_handler, DATA_FOLDER, recursive=False)
        observer.start()

        print(f"Watching '{DATA_FOLDER}' folder for new data... (Press Ctrl+C to stop)")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            observer.stop()
        observer.join()
    else:
        print(f"Watch directory '{DATA_FOLDER}' does not exist.")
