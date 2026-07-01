const files = [
  { FileID: "FILE-001", Name: "Joseph Marinello", EstimatedDebtAmount: 45000.00, FirstDraftDate: "2024-01-15T00:00:00", CurrentWeeklyPayment: 875.00,  NSFDate: "2024-03-10T00:00:00", CurrentEscrowBalance: 2100.00 },
  { FileID: "FILE-002", Name: "Carlos Reyes",     EstimatedDebtAmount: 28500.00, FirstDraftDate: "2024-02-01T00:00:00", CurrentWeeklyPayment: 550.00,  NSFDate: "2024-04-05T00:00:00", CurrentEscrowBalance: 1350.00 },
  { FileID: "FILE-003", Name: "Linda Park",       EstimatedDebtAmount: 62000.00, FirstDraftDate: "2024-01-08T00:00:00", CurrentWeeklyPayment: 1200.00, NSFDate: "",                    CurrentEscrowBalance: 4800.00 },
  { FileID: "FILE-004", Name: "Raj Patel",        EstimatedDebtAmount: 33750.00, FirstDraftDate: "2024-03-01T00:00:00", CurrentWeeklyPayment: 650.00,  NSFDate: "2024-05-20T00:00:00", CurrentEscrowBalance: 975.00  },
  { FileID: "FILE-005", Name: "Angela Torres",    EstimatedDebtAmount: 51200.00, FirstDraftDate: "2024-02-15T00:00:00", CurrentWeeklyPayment: 990.00,  NSFDate: "2024-03-28T00:00:00", CurrentEscrowBalance: 3200.00 }
];

const accounts = [
  { AccountID: "ACC-001", Name: "Joseph Marinello", SSN: "XXX-XX-4821", DriversLicense: "NY-M4829301" },
  { AccountID: "ACC-002", Name: "Carlos Reyes",     SSN: "XXX-XX-7743", DriversLicense: "NJ-R7734820" },
  { AccountID: "ACC-003", Name: "Linda Park",       SSN: "XXX-XX-3390", DriversLicense: "NY-P3312984" },
  { AccountID: "ACC-004", Name: "Raj Patel",        SSN: "XXX-XX-6612", DriversLicense: "CT-P6678341" },
  { AccountID: "ACC-005", Name: "Angela Torres",    SSN: "XXX-XX-9157", DriversLicense: "NY-T9102847" }
];

module.exports = { files, accounts };
