import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import os
import time
from datetime import datetime

# watchdog naye CSV file ko detect krne ke liye
# pip install watchdog
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# ye all charts ko style kr dega
plt.style.use('ggplot')

# input aur output folder ke path
DATA_FOLDER = 'Data'
OUTPUT_FOLDER = 'Outputs'

# agar Outputs folder pehle se nahi hai to bana do
if not os.path.exists(OUTPUT_FOLDER):
    os.makedirs(OUTPUT_FOLDER)


def analyze_online_fraud(file_path):
    # pehla dataset: ONLINE FRAUD TRANSACTIONS
    print("\nLoading dataset: onlinefraud.csv...")
    df1 = pd.read_csv(file_path)

    # Very Simple Data Inspection
    print("\n--- Dataset 1 Summary ---")
    print("Total rows:", len(df1))
    print("Columns:", list(df1.columns))
    print("Missing values:\n", df1.isnull().sum())
    print("Total fraud cases:", df1['isFraud'].sum())

    # Feature Engineering
    # 1 step = 1 hour okie.
    df1['hour_of_day'] = (df1['step'] - 1) % 24

    # Group Data by Transaction Type
    type_data = df1.groupby('type', observed=False).agg(
        total_tx=('isFraud', 'count'),
        fraud_tx=('isFraud', 'sum')
    ).reset_index()
    type_data['fraud_rate_pct'] = (type_data['fraud_tx'] / type_data['total_tx']) * 100  # tx = transactions

    # Group Data by Hour of Day
    hourly_data = df1.groupby('hour_of_day').agg(
        total_tx=('isFraud', 'count'),
        fraud_tx=('isFraud', 'sum')
    ).reset_index()

    # CHART 1: Total Transactions by Type
    plt.figure(figsize=(8, 5))
    sns.barplot(data=type_data, x='type', y='total_tx', hue='type', palette='Blues_d', legend=False)
    plt.yscale('log')  # Log scale kyuki counts bohat large the
    plt.title('Total Transactions by Type (Log Scale)')
    plt.xlabel('Transaction Type')
    plt.ylabel('Total Transactions (Log Scale)')
    for index, row in type_data.iterrows():
        plt.text(index, row['total_tx'], f"{int(row['total_tx']):,}", ha='center', va='bottom', fontsize=8)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_FOLDER, 'Transaction_types.png'), dpi=300)
    plt.close()
    print("Created Transaction_types.png")

    # CHART 2: Fraud Rate by Transaction Type
    # pct = percentage okie
    plt.figure(figsize=(8, 5))
    sns.barplot(data=type_data, x='type', y='fraud_rate_pct', hue='type', palette='Reds_d', legend=False)
    plt.title('Fraud Rate by Transaction Type')
    plt.xlabel('Transaction Type')
    plt.ylabel('Fraud Rate (%)')
    for index, row in type_data.iterrows():
        if row['fraud_rate_pct'] > 0:
            plt.text(index, row['fraud_rate_pct'], f"{row['fraud_rate_pct']:.3f}%", ha='center', va='bottom', fontsize=9)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_FOLDER, 'Fraud_rate_by_type.png'), dpi=300)
    plt.close()
    print("Created Fraud_rate_by_type.png")

    # CHART 3: Hourly Fraud Trend - 24 Hr Cycle
    plt.figure(figsize=(9, 5))
    plt.plot(hourly_data['hour_of_day'], hourly_data['fraud_tx'], marker='o', color='red', linewidth=2)
    plt.title('Fraud Cases by Hour of Day (0 to 23)')
    plt.xlabel('Hour of Day (24-Hour Format)')
    plt.ylabel('Number of Fraud Cases')
    plt.xticks(range(0, 24))
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_FOLDER, 'Hourly_fraud_trend.png'), dpi=300)
    plt.close()
    print("Created Hourly_fraud_trend.png")

    # CHART 4: Feature Correlation Heatmap
    num_cols = ['amount', 'oldbalanceOrg', 'newbalanceOrig', 'oldbalanceDest', 'newbalanceDest', 'isFraud']
    corr_matrix = df1[num_cols].corr()
    plt.figure(figsize=(8, 6))
    sns.heatmap(corr_matrix, annot=True, fmt='.2f', cmap='coolwarm', vmin=-1, vmax=1)
    plt.title('Feature Correlation Heatmap (onlinefraud.csv)')
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_FOLDER, 'Balance_correlation_heatmap.png'), dpi=300)
    plt.close()
    print("Created Balance_correlation_heatmap.png")

    # CHART 5: Amount Distribution - Fraud vs Legit 
    # amount ki range bohat zyada hai isliye log scale le rahe
    df1['log_amount'] = np.log1p(df1['amount'])  # log1p taki amount=0 pe bhi error na aaye
    plt.figure(figsize=(8, 5))
    sns.histplot(data=df1, x='log_amount', hue='isFraud', kde=True,
                 palette=['skyblue', 'red'], element='step', stat='density', common_norm=False)
    plt.title('Transaction Amount Distribution: Fraud vs Legit (Log Scale)')
    plt.xlabel('Log(Amount + 1)')
    plt.ylabel('Density')
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_FOLDER, 'Amount_distribution.png'), dpi=300)
    plt.close()
    print("Created Amount_distribution.png")


def analyze_synthetic_fraud(file_path):
    # Dusra Dataset: CREDIT CARD TRANSACTIONS
    print("\nLoading dataset: synthetic_fraud_data.csv...")
    df2 = pd.read_csv(file_path)

    # Basic Data Inspection
    print("\n--- Dataset 2 Summary ---")
    print("Total rows:", len(df2))
    print("Columns:", list(df2.columns))
    print("Missing values:\n", df2.isnull().sum())
    print("Total fraud cases:", df2['is_fraud'].sum())

    # Merchant Category Grouping
    merchant_data = df2.groupby('merchant_category').agg(
        total_tx=('is_fraud', 'count'),
        fraud_tx=('is_fraud', 'sum')
    ).reset_index()
    merchant_data['fraud_rate_pct'] = (merchant_data['fraud_tx'] / merchant_data['total_tx']) * 100
    merchant_data = merchant_data.sort_values('fraud_rate_pct', ascending=False)

    # Card Present vs Card Not Present Grouping
    card_data = df2.groupby(['card_type', 'card_present']).agg(
        total_tx=('is_fraud', 'count'),
        fraud_tx=('is_fraud', 'sum')
    ).reset_index()
    card_data['fraud_rate_pct'] = (card_data['fraud_tx'] / card_data['total_tx']) * 100
    card_data['card_present_label'] = card_data['card_present'].map({True: 'Card Present', False: 'Card Not Present'})

    # CHART 6: Fraud Rate Across Merchant Categories
    plt.figure(figsize=(9, 5))
    sns.barplot(data=merchant_data, x='merchant_category', y='fraud_rate_pct', hue='merchant_category', palette='Reds_r', legend=False)
    plt.title('Fraud Rate (%) Across Merchant Categories')
    plt.xlabel('Merchant Category')
    plt.ylabel('Fraud Rate (%)')
    plt.xticks(rotation=40, ha='right')
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_FOLDER, 'Merchant_category_fraud.png'), dpi=300)
    plt.close()
    print("Created Merchant_category_fraud.png")

    # CHART 7: Card Present vs Card Not Present Fraud Rate
    plt.figure(figsize=(8, 5))
    sns.barplot(data=card_data, x='card_type', y='fraud_rate_pct', hue='card_present_label', palette='Set1')
    plt.title('Fraud Rate by Card Type and Card Present Status')
    plt.xlabel('Card Type')
    plt.ylabel('Fraud Rate (%)')
    plt.legend(title='Transaction Mode')
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_FOLDER, 'Card_present_vs_cnp.png'), dpi=300)
    plt.close()
    print("Created Card_present_vs_cnp.png")

    # CHART 8: Distance from Home (Legitimate vs Fraudulent) - Boxplot
    plt.figure(figsize=(7, 5))
    sns.boxplot(data=df2, x='is_fraud', y='distance_from_home', hue='is_fraud', palette='Set2', legend=False)
    plt.title('Distance from Home (Legitimate vs Fraudulent)')
    plt.xlabel('Is Fraud (False = Legitimate, True = Fraud)')
    plt.ylabel('Distance from Home (km)')
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_FOLDER, 'Distance_from_home_boxplot.png'), dpi=300)
    plt.close()
    print("Created Distance_from_home_boxplot.png")

    # CHART 9: Distance from Home Distribution
    plt.figure(figsize=(8, 5))
    sns.histplot(data=df2, x='distance_from_home', hue='is_fraud', kde=True,
                 palette=['skyblue', 'red'], element='step', stat='density', common_norm=False)
    plt.title('Distance from Home Distribution: Fraud vs Legit')
    plt.xlabel('Distance from Home (km)')
    plt.ylabel('Density')
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_FOLDER, 'Distance_distribution.png'), dpi=300)
    plt.close()
    print("Created Distance_distribution.png")

    # CHART 10: Transaction Amount Distribution
    # agar amount column dataset me maujood hai to hi ye chart banega
    if 'amount' in df2.columns:
        plt.figure(figsize=(8, 5))
        sns.histplot(data=df2, x='amount', hue='is_fraud', kde=True,
                     palette=['skyblue', 'red'], element='step', stat='density', common_norm=False)
        plt.title('Transaction Amount Distribution: Fraud vs Legit')
        plt.xlabel('Amount')
        plt.ylabel('Density')
        plt.tight_layout()
        plt.savefig(os.path.join(OUTPUT_FOLDER, 'Card_amount_distribution.png'), dpi=300)
        plt.close()
        print("Created Card_amount_distribution.png")


def run_full_analysis():
    # ye function pura analysis chalaye ga, dono dataset ke liye
    # isko baar baar call kr sakte hai jab bhi naya data aaye
    print("\n==================================================================")
    print("Running fraud analysis at:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print("==================================================================")

    file1 = os.path.join(DATA_FOLDER, 'onlinefraud.csv')
    file2 = os.path.join(DATA_FOLDER, 'synthetic_fraud_data.csv')

    if os.path.exists(file1):
        analyze_online_fraud(file1)
    else:
        print("onlinefraud.csv nahi mila, skip kr rahe hai...")

    if os.path.exists(file2):
        analyze_synthetic_fraud(file2)
    else:
        print("synthetic_fraud_data.csv nahi mila, skip kr rahe hai...")

    print("\nAnalysis complete! Sare charts '" + OUTPUT_FOLDER + "' folder me save ho gaye.")
    print("==================================================================\n")

#----------------------------------- BYE BABES -----------------------------
#-----------------------Catch you on the flip side, dolls....------------------



# iske neeche wala code AI gen hai by BlackBox - Minimax 2.7
class DataChangeHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.src_path.endswith('.csv'):
            print("\nNaya file mila:", event.src_path)
            time.sleep(2)  
            run_full_analysis()

    def on_modified(self, event):
        if event.src_path.endswith('.csv'):
            print("\nFile update hui:", event.src_path)
            time.sleep(2)
            run_full_analysis()


if __name__ == "__main__":
    run_full_analysis()

    event_handler = DataChangeHandler()
    observer = Observer()
    observer.schedule(event_handler, DATA_FOLDER, recursive=False)
    observer.start()

    print("Watching '" + DATA_FOLDER + "' folder for new data... (Ctrl+C to stop)")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
