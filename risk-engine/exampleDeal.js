/**
 * EXAMPLE DEAL — a synthetic multifamily fixture used to demonstrate the risk engine.
 *
 * The property, address, broker and tenant names are invented and the figures are
 * scaled. The real offering memorandum this project was built against is a
 * confidential third party document and is deliberately not included in this repository.
 *
 * To screen a different multifamily OM, produce another object of this same shape,
 * or let the n8n extraction workflow emit it.
 *
 * Sign convention: income positive, expenses stored as POSITIVE magnitudes.
 * Periods: t12 = trailing twelve actual, current = current annualized, seller = seller Year 1 pro forma.
 */
module.exports = {
  "meta": {
    "name": "Example Tower",
    "address": "100 Example Avenue, Metro City",
    "submarket": "Central submarket",
    "broker": "Example Brokerage",
    "omDate": "2025",
    "sourceOM": "example-offering-memorandum.pdf"
  },
  "property": {
    "units": 218,
    "yearBuilt": 2015,
    "stories": 12,
    "nrsf": 208155,
    "retailSf": 16376,
    "avgUnitSf": 955,
    "siteAcres": 1,
    "garageSpaces": 224
  },
  "occupancy": {
    "physical": 0.96,
    "leased": 0.85
  },
  "rents": {
    "avgEffRent": 2808,
    "avgEffPsf": 2.94,
    "submarketAAPsf": 3.28
  },
  "income": {
    "gsr": {
      "t12": 7601310,
      "t3ann": 7556129,
      "current": 7556129,
      "seller": 7820594
    },
    "vacancy": {
      "t12": 278798,
      "current": 281960,
      "seller": 391030
    },
    "concessions": {
      "t12": 108869,
      "current": 95152,
      "seller": 0
    },
    "badDebt": {
      "t12": -102,
      "current": 7556,
      "seller": 7820
    },
    "egi": {
      "t12": 9217502,
      "current": 9367923,
      "seller": 9659003
    }
  },
  "expenses": {
    "controllable": {
      "t12": 1609860,
      "current": 1542334,
      "seller": 1583524
    },
    "turnover": {
      "t12": 102725,
      "seller": 69715
    },
    "rm": {
      "t12": 134110,
      "seller": 99593
    },
    "mgmtFee": {
      "t12": 0,
      "current": 187359,
      "seller": 193180,
      "pctOfEgi": 0.02
    },
    "reTaxes": {
      "t12": 645667,
      "seller": 786927
    },
    "insurance": {
      "t12": 57596,
      "seller": 139431
    },
    "reserves": {
      "t12": 29878,
      "seller": 29878,
      "perUnit": 137
    },
    "totalOpex": {
      "t12": 2357760,
      "seller": 2747700
    }
  },
  "noi": {
    "t12": 6859742,
    "t3ann": 6915990,
    "current": 6667236,
    "seller": 6911304
  },
  "tax": {
    "fmv": 124638000,
    "assessedValue": 9935697,
    "ratio": 0.0797,
    "mill": 79.202,
    "amount": 786927
  },
  "pricing": {
    "askingPrice": null,
    "statedCapRate": null,
    "assessorFmv": 124638000
  },
  "debt": {
    "inPlace": null,
    "freeAndClear": true
  },
  "financing": {
    "ltv": 0.6,
    "rate": 0.0625,
    "amortYears": 30,
    "ioYears": 2
  },
  "underwrite": {
    "yr1NoiUW": 6611402,
    "yr1RentGrowth": 0.035,
    "vacancyUW": 0.05
  },
  "valueAdd": {
    "reservesPerUnit": 137,
    "renovationCapexBudgeted": 0,
    "interiorPremiumsClaimed": true,
    "roiSheetInOM": false,
    "fitnessModernizationClaimed": true,
    "futureSupplyRentClaimPsf": 1.37
  },
  "buildingSystems": {
    "roofYear": 2015,
    "roofType": "TPO",
    "boilerReplaced": 2024,
    "pcaProvided": false
  },
  "retail": {
    "sf": 16376,
    "anchorTenant": "Anchor restaurant tenant",
    "anchorSf": 7812,
    "anchorPctSf": 0.477,
    "anchorAbatement2026": true,
    "rollWithinHoldPctSf": 0.2
  },
  "market": {
    "officeVacancy": 0.04,
    "retailVacancy": 0.02,
    "submarketMfVacancyEst": 0.02,
    "pipelineUnitsCCR": 1127,
    "avgHhIncome1mi": 210151,
    "rentControl": false
  },
  "comps": {
    "providedCount": 5,
    "internalInconsistency": true
  },
  "dataIntegrity": {
    "documentedInconsistencies": 5,
    "notes": [
      "Framing described inconsistently between the summary and the construction detail",
      "Physical occupancy stated well above leased rate",
      "Comparable property unit count conflicts between two pages",
      "Comparable rent per SF conflicts between two pages",
      "Headline supply differential overstated versus the underlying figures"
    ]
  },
  "rentRoll": {
    "unitLevelProvided": false,
    "lossToLeaseDisclosed": false,
    "marketRentDisclosed": false
  },
  "regulatory": {
    "jurisdiction": "Metro City",
    "rentControl": false,
    "affordableUnitsDisclosed": false
  },
  "missingDD": {
    "criticalMissingCount": 8,
    "items": [
      "Full unit-level rent roll",
      "T-12 operating statement + GL",
      "Leased-vs-occupied / NTV report",
      "Bound insurance policy + loss runs",
      "Tax bills + assessment history",
      "Renovation ROI sheet / invoices",
      "Property condition assessment",
      "All 5 retail leases"
    ]
  },
  "hold": {
    "years": 5,
    "exitCap": 0.0525
  }
};
