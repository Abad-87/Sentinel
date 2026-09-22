export const initialTransactions = [
  {
    id: "TXN-90241",
    timestamp: "2 mins ago",
    step: 2,
    type: "TRANSFER",
    amount: 340000.00,
    oldbalanceOrg: 340000.00,
    newbalanceOrig: 0.00,
    newbalanceDest: 0.00,
    sender: "acc_9281_orlando",
    recipient: "acc_4021_ghost",
    risk: "High Risk",
    fraudProbability: 99.12,
    status: "Blocked",
    anomalyFlags: [
      "Origin account balance drained completely ($0 balance)",
      "High value transfer exceeding $200,000 threshold",
      "Off-peak early morning activity (Step 2 = 02:00 AM)"
    ],
    recommendations: [
      "Freeze originating account pending identity verification.",
      "Flag destination account activity for fraud ring review.",
      "Require secondary verification before unlocking funds."
    ]
  },
  {
    id: "TXN-90240",
    timestamp: "8 mins ago",
    step: 14,
    type: "PAYMENT",
    amount: 142.50,
    oldbalanceOrg: 3200.00,
    newbalanceOrig: 3057.50,
    newbalanceDest: 0.00,
    sender: "acc_1048_emma",
    recipient: "merch_starbucks_hq",
    risk: "Low Risk",
    fraudProbability: 1.45,
    status: "Approved",
    anomalyFlags: [],
    recommendations: [
      "Transaction appears normal. Maintain standard transaction monitoring."
    ]
  },
  {
    id: "TXN-90239",
    timestamp: "19 mins ago",
    step: 4,
    type: "CASH_OUT",
    amount: 85200.00,
    oldbalanceOrg: 92000.00,
    newbalanceOrig: 6800.00,
    newbalanceDest: 120500.00,
    sender: "acc_6732_marcus",
    recipient: "atm_terminal_812",
    risk: "Medium Risk",
    fraudProbability: 58.40,
    status: "Under Review",
    anomalyFlags: [
      "Unusual cash-out velocity for this account tier",
      "Night transaction (Step 4 = 04:00 AM)"
    ],
    recommendations: [
      "Perform enhanced verification via SMS/hardware token.",
      "Verify customer location matches ATM IP coordinates."
    ]
  },
  {
    id: "TXN-90238",
    timestamp: "32 mins ago",
    step: 11,
    type: "TRANSFER",
    amount: 195000.00,
    oldbalanceOrg: 200000.00,
    newbalanceOrig: 5000.00,
    newbalanceDest: 0.00,
    sender: "acc_3391_harrison",
    recipient: "acc_8819_crypto_gateway",
    risk: "High Risk",
    fraudProbability: 92.75,
    status: "Blocked",
    anomalyFlags: [
      "Destination balance shows zero balance anomaly",
      "Rapid depletion of 97.5% account funds"
    ],
    recommendations: [
      "Review destination account activity.",
      "Hold transaction for manual compliance sign-off."
    ]
  },
  {
    id: "TXN-90237",
    timestamp: "45 mins ago",
    step: 16,
    type: "PAYMENT",
    amount: 49.99,
    oldbalanceOrg: 1450.20,
    newbalanceOrig: 1400.21,
    newbalanceDest: 0.00,
    sender: "acc_5182_sophia",
    recipient: "merch_amazon_aws",
    risk: "Low Risk",
    fraudProbability: 0.82,
    status: "Approved",
    anomalyFlags: [],
    recommendations: [
      "Transaction appears low risk, continue normal monitoring."
    ]
  },
  {
    id: "TXN-90236",
    timestamp: "1 hour ago",
    step: 22,
    type: "DEBIT",
    amount: 610.00,
    oldbalanceOrg: 5400.00,
    newbalanceOrig: 4790.00,
    newbalanceDest: 0.00,
    sender: "acc_7811_lucas",
    recipient: "acc_9011_utility_bill",
    risk: "Low Risk",
    fraudProbability: 2.10,
    status: "Approved",
    anomalyFlags: [],
    recommendations: [
      "Normal utility debit pattern verified."
    ]
  },
  {
    id: "TXN-90235",
    timestamp: "2 hours ago",
    step: 3,
    type: "TRANSFER",
    amount: 215000.00,
    oldbalanceOrg: 215000.00,
    newbalanceOrig: 0.00,
    newbalanceDest: 0.00,
    sender: "acc_9281_orlando",
    recipient: "acc_8819_crypto_gateway",
    risk: "High Risk",
    fraudProbability: 98.60,
    status: "Blocked",
    anomalyFlags: [
      "Repeated complete balance drainage from same origin entity",
      "High-risk crypto counterparty gateway",
      "Off-peak night execution (03:00 AM)"
    ],
    recommendations: [
      "Origin account frozen due to repeated drainage attempts.",
      "Dispatch forensic alert to Compliance Risk team."
    ]
  },
  {
    id: "TXN-90234",
    timestamp: "3 hours ago",
    step: 10,
    type: "CASH_IN",
    amount: 12000.00,
    oldbalanceOrg: 500.00,
    newbalanceOrig: 12500.00,
    newbalanceDest: 0.00,
    sender: "acc_2104_olivia",
    recipient: "bank_payroll_ach",
    risk: "Low Risk",
    fraudProbability: 1.15,
    status: "Approved",
    anomalyFlags: [],
    recommendations: [
      "Verified direct payroll deposit."
    ]
  }
];
