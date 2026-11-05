/**
 * GOLDEN SNAPSHOT of the old browser aggregation (DW16 of #303), recorded when it was deleted.
 *
 * Until #303 Task 10 the reporting dashboard computed its summary in the browser, from every response
 * and answer row (forms-ng `reporting-aggregations.ts`, `respondent-profile.ts`,
 * `open-text-insights.ts` and `temporal-buckets.ts`, driven by `FormsReportingService.loadReport`).
 * Task 9 held the server summary to those functions LIVE, by importing them from forms-ng source.
 * Task 10 deleted them, so their output on the parity fixture is recorded here instead, and the
 * comparison stands against the record rather than being dropped.
 *
 * How it was produced (once, on commit 10cd672 with the fixture rows in `parity-fixture.ts`): the
 * browser functions were driven exactly as `loadReport` drove them (insights over the Complete
 * responses' answers, the funnel over every answer), and the result was mapped to the server's shape
 * applying ONLY the documented differences listed in `FormReportingEngine.parity.spec.ts`:
 *   D1  `PartialPlusDisqualified` is the browser's `partialResponses` (every non-Complete row);
 *   D2  choice buckets labelled with a raw off-list value are folded into one "Other (not an option)";
 *   D3  `MatrixCells` are the cell counts the fixture's two Matrix answers hold (the browser listed
 *       rendered answers, which never leave the server);
 *   D4  shape only: PascalCase, ISO instants, `null` where the browser left a field out, the type
 *       key where the browser had a display label.
 * Nothing below was edited by hand. A server change that disagrees with this file changes what the
 * dashboard shows, and needs the justification a change to the old functions would have needed.
 */
import type {
  FormsAnswerBucket,
  FormsFunnelStep,
  FormsOpenTextInsight,
  FormsQuestionBreakdown,
  FormsRespondentProfile,
} from '@mj-biz-apps/forms-entities';

/** The browser's report in the server's shape. `Summary` keeps the browser's single non-Complete count (D1). */
export interface BrowserSummary {
  Summary: {
    TotalResponses: number;
    CompleteResponses: number;
    PartialPlusDisqualified: number;
    CompletionRate: number;
    TypicalCompletionSeconds: number | null;
    LastSubmittedAt: string | null;
  };
  Profile: FormsRespondentProfile;
  Questions: FormsQuestionBreakdown[];
  OpenText: FormsOpenTextInsight[];
  Funnel: FormsFunnelStep[];
}

/** The browser over `RESPONSES` and `ANSWERS` (the fake-provider parity spec). */
export const BROWSER_SUMMARY: BrowserSummary = {
  Summary: {
    TotalResponses: 5,
    CompleteResponses: 5,
    PartialPlusDisqualified: 3,
    CompletionRate: 0.625,
    TypicalCompletionSeconds: 150,
    LastSubmittedAt: "2026-09-05T10:01:30.000Z"
  },
  Profile: {
    IsEmpty: false,
    Metrics: [
      {
        Label: "Contactable",
        Value: "5",
        Detail: "of 5 responses gave an email",
        Fraction: 1
      },
      {
        Label: "Distinct people",
        Value: "4",
        Detail: "1 submitted more than once",
        Fraction: null
      },
      {
        Label: "Work addresses",
        Value: "75%",
        Detail: "not a known consumer mailbox",
        Fraction: 0.75
      },
      {
        Label: "Phone given",
        Value: "2",
        Detail: "of 5 responses",
        Fraction: 0.4
      },
      {
        Label: "Address given",
        Value: "2",
        Detail: "of 5 responses",
        Fraction: 0.4
      },
      {
        Label: "Files attached",
        Value: "1",
        Detail: "of 5 responses",
        Fraction: 0.2
      }
    ],
    Distributions: [
      {
        Title: "Email domains",
        Caption: "Where respondents’ addresses are hosted. Local parts are never read or stored here.",
        Buckets: [
          {
            Label: "example.org",
            Count: 4,
            Fraction: 0.6666666666666666
          },
          {
            Label: "gmail.com",
            Count: 1,
            Fraction: 0.16666666666666666
          },
          {
            Label: "kernel.example",
            Count: 1,
            Fraction: 0.16666666666666666
          }
        ]
      },
      {
        Title: "Countries",
        Caption: "From the country part of the address question.",
        Buckets: [
          {
            Label: "FR",
            Count: 1,
            Fraction: 0.5
          },
          {
            Label: "UK",
            Count: 1,
            Fraction: 0.5
          }
        ]
      },
      {
        Title: "Organisations",
        Caption: "As typed by respondents, so spellings are not merged.",
        Buckets: [
          {
            Label: "Analytical Engines",
            Count: 1,
            Fraction: 1
          }
        ]
      }
    ]
  },
  Questions: [
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000110",
      Prompt: "Favourite colour",
      QuestionType: "SingleChoice",
      Role: "choice",
      AnsweredCount: 4,
      Buckets: [
        {
          Label: "Green",
          Count: 2,
          Fraction: 0.5
        },
        {
          Label: "Red",
          Count: 1,
          Fraction: 0.25
        },
        {
          Label: "Other (not an option)",
          Count: 1,
          Fraction: 0.25
        },
        {
          Label: "Blue",
          Count: 0,
          Fraction: 0
        }
      ],
      Numeric: null,
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000111",
      Prompt: "Toppings",
      QuestionType: "MultiChoice",
      Role: "choice",
      AnsweredCount: 2,
      Buckets: [
        {
          Label: "Cheese",
          Count: 2,
          Fraction: 0.6666666666666666
        },
        {
          Label: "Olive",
          Count: 1,
          Fraction: 0.3333333333333333
        }
      ],
      Numeric: null,
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000112",
      Prompt: "Rate us",
      QuestionType: "Rating",
      Role: "scale",
      AnsweredCount: 3,
      Buckets: [],
      Numeric: {
        Answered: 3,
        Min: 3,
        Max: 5,
        Average: 4,
        NPSScore: null,
        NPSSegments: null
      },
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000113",
      Prompt: "Recommend us?",
      QuestionType: "NPS",
      Role: "scale",
      AnsweredCount: 4,
      Buckets: [],
      Numeric: {
        Answered: 4,
        Min: 6,
        Max: 99,
        Average: 30.75,
        NPSScore: 0,
        NPSSegments: {
          Detractors: 1,
          Passives: 1,
          Promoters: 1
        }
      },
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000114",
      Prompt: "Would you return?",
      QuestionType: "YesNo",
      Role: "sentiment",
      AnsweredCount: 3,
      Buckets: [
        {
          Label: "Yes",
          Count: 2,
          Fraction: 0.6666666666666666
        },
        {
          Label: "No",
          Count: 1,
          Fraction: 0.3333333333333333
        }
      ],
      Numeric: null,
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000115",
      Prompt: "Terms",
      QuestionType: "Legal",
      Role: "consent",
      AnsweredCount: 2,
      Buckets: [
        {
          Label: "Yes",
          Count: 2,
          Fraction: 1
        },
        {
          Label: "No",
          Count: 0,
          Fraction: 0
        }
      ],
      Numeric: null,
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000116",
      Prompt: "Start date",
      QuestionType: "Date",
      Role: "temporal",
      AnsweredCount: 2,
      Buckets: [
        {
          Label: "Sep 2026",
          Count: 1,
          Fraction: 0.5
        },
        {
          Label: "Oct 2026",
          Count: 1,
          Fraction: 0.5
        }
      ],
      Numeric: null,
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000117",
      Prompt: "Best time",
      QuestionType: "Time",
      Role: "temporal",
      AnsweredCount: 2,
      Buckets: [
        {
          Label: "Morning (6am–12pm)",
          Count: 1,
          Fraction: 0.5
        },
        {
          Label: "Afternoon (12–5pm)",
          Count: 1,
          Fraction: 0.5
        }
      ],
      Numeric: null,
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000118",
      Prompt: "Rate each",
      QuestionType: "Matrix",
      Role: "composite",
      AnsweredCount: 2,
      Buckets: [],
      Numeric: null,
      MatrixCells: [
        {
          RowLabel: "Venue",
          ColumnLabel: "Good",
          Count: 2
        },
        {
          RowLabel: "Venue",
          ColumnLabel: "Poor",
          Count: 1
        },
        {
          RowLabel: "Food",
          ColumnLabel: "Good",
          Count: 0
        },
        {
          RowLabel: "Food",
          ColumnLabel: "Poor",
          Count: 1
        }
      ]
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000130",
      Prompt: "How many?",
      QuestionType: "Number",
      Role: "scale",
      AnsweredCount: 0,
      Buckets: [],
      Numeric: {
        Answered: 0,
        Min: null,
        Max: null,
        Average: null,
        NPSScore: null,
        NPSSegments: null
      },
      MatrixCells: []
    }
  ],
  OpenText: [
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000101",
      Prompt: "Full name",
      QuestionType: "ShortText",
      Answered: 3,
      Skipped: 2,
      ResponseRate: 0.6,
      MedianLength: 12,
      Themes: [],
      ThemesApply: false
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000119",
      Prompt: "Anything else?",
      QuestionType: "LongText",
      Answered: 3,
      Skipped: 2,
      ResponseRate: 0.6,
      MedianLength: 31,
      Themes: [
        {
          Term: "checkout",
          Answers: 2,
          Fraction: 0.6666666666666666
        },
        {
          Term: "pricing",
          Answers: 2,
          Fraction: 0.6666666666666666
        },
        {
          Term: "slow",
          Answers: 2,
          Fraction: 0.6666666666666666
        }
      ],
      ThemesApply: true
    }
  ],
  Funnel: [
    {
      PageID: "0f0f0f0f-0000-4000-8000-000000000011",
      Title: "Page 1",
      DisplayOrder: 1,
      Reached: 7,
      Retention: 1,
      DropOff: 0
    },
    {
      PageID: "0f0f0f0f-0000-4000-8000-000000000012",
      Title: "Opinions",
      DisplayOrder: 2,
      Reached: 6,
      Retention: 0.8571428571428571,
      DropOff: 0.14285714285714285
    },
    {
      PageID: "0f0f0f0f-0000-4000-8000-000000000013",
      Title: "Extra",
      DisplayOrder: 3,
      Reached: 0,
      Retention: 0,
      DropOff: 1
    }
  ]
};

/** The labels of the browser's colour card: the raw off-list value `mauve` was a bucket of its own (what D2 folds). */
export const BROWSER_COLOUR_LABELS: string[] = ["Green","Red","mauve","Blue"];

/**
 * The browser's YesNo card with one more, BLANK, answer row (r5's, answering nothing): the browser
 * counted the row as an answer (4) where the server counts responses that stored a value (3). The
 * buckets are the same either way.
 */
export const BROWSER_YESNO_WITH_A_BLANK_ROW: { AnsweredCount: number; Buckets: FormsAnswerBucket[] } = {
  AnsweredCount: 4,
  Buckets: [
    {
      Label: "Yes",
      Count: 2,
      Fraction: 0.6666666666666666
    },
    {
      Label: "No",
      Count: 1,
      Fraction: 0.3333333333333333
    }
  ]
};

/**
 * The browser over `REAL_DB_RESPONSES` and `REAL_DB_ANSWERS` (the opt-in real-database spec), under
 * the FIXTURE's question and page ids; that spec maps them onto the ids its published form was given.
 */
export const BROWSER_SUMMARY_REAL_DB_ROWS: BrowserSummary = {
  Summary: {
    TotalResponses: 7,
    CompleteResponses: 7,
    PartialPlusDisqualified: 3,
    CompletionRate: 0.7,
    TypicalCompletionSeconds: 120,
    LastSubmittedAt: "2026-09-09T10:02:00.000Z"
  },
  Profile: {
    IsEmpty: false,
    Metrics: [
      {
        Label: "Contactable",
        Value: "5",
        Detail: "of 7 responses gave an email",
        Fraction: 0.7142857142857143
      },
      {
        Label: "Distinct people",
        Value: "4",
        Detail: "1 submitted more than once",
        Fraction: null
      },
      {
        Label: "Work addresses",
        Value: "75%",
        Detail: "not a known consumer mailbox",
        Fraction: 0.75
      },
      {
        Label: "Phone given",
        Value: "2",
        Detail: "of 7 responses",
        Fraction: 0.2857142857142857
      },
      {
        Label: "Address given",
        Value: "2",
        Detail: "of 7 responses",
        Fraction: 0.2857142857142857
      }
    ],
    Distributions: [
      {
        Title: "Email domains",
        Caption: "Where respondents’ addresses are hosted. Local parts are never read or stored here.",
        Buckets: [
          {
            Label: "example.org",
            Count: 4,
            Fraction: 0.6666666666666666
          },
          {
            Label: "gmail.com",
            Count: 1,
            Fraction: 0.16666666666666666
          },
          {
            Label: "kernel.example",
            Count: 1,
            Fraction: 0.16666666666666666
          }
        ]
      },
      {
        Title: "Countries",
        Caption: "From the country part of the address question.",
        Buckets: [
          {
            Label: "FR",
            Count: 1,
            Fraction: 0.5
          },
          {
            Label: "UK",
            Count: 1,
            Fraction: 0.5
          }
        ]
      },
      {
        Title: "Organisations",
        Caption: "As typed by respondents, so spellings are not merged.",
        Buckets: [
          {
            Label: "Analytical Engines",
            Count: 1,
            Fraction: 1
          }
        ]
      }
    ]
  },
  Questions: [
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000110",
      Prompt: "Favourite colour",
      QuestionType: "SingleChoice",
      Role: "choice",
      AnsweredCount: 6,
      Buckets: [
        {
          Label: "Other (not an option)",
          Count: 3,
          Fraction: 0.5
        },
        {
          Label: "Green",
          Count: 2,
          Fraction: 0.3333333333333333
        },
        {
          Label: "Red",
          Count: 1,
          Fraction: 0.16666666666666666
        },
        {
          Label: "Blue",
          Count: 0,
          Fraction: 0
        }
      ],
      Numeric: null,
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000111",
      Prompt: "Toppings",
      QuestionType: "MultiChoice",
      Role: "choice",
      AnsweredCount: 2,
      Buckets: [
        {
          Label: "Cheese",
          Count: 2,
          Fraction: 0.6666666666666666
        },
        {
          Label: "Olive",
          Count: 1,
          Fraction: 0.3333333333333333
        }
      ],
      Numeric: null,
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000112",
      Prompt: "Rate us",
      QuestionType: "Rating",
      Role: "scale",
      AnsweredCount: 3,
      Buckets: [],
      Numeric: {
        Answered: 3,
        Min: 3,
        Max: 5,
        Average: 4,
        NPSScore: null,
        NPSSegments: null
      },
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000113",
      Prompt: "Recommend us?",
      QuestionType: "NPS",
      Role: "scale",
      AnsweredCount: 4,
      Buckets: [],
      Numeric: {
        Answered: 4,
        Min: 6,
        Max: 99,
        Average: 30.75,
        NPSScore: 0,
        NPSSegments: {
          Detractors: 1,
          Passives: 1,
          Promoters: 1
        }
      },
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000114",
      Prompt: "Would you return?",
      QuestionType: "YesNo",
      Role: "sentiment",
      AnsweredCount: 3,
      Buckets: [
        {
          Label: "Yes",
          Count: 2,
          Fraction: 0.6666666666666666
        },
        {
          Label: "No",
          Count: 1,
          Fraction: 0.3333333333333333
        }
      ],
      Numeric: null,
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000115",
      Prompt: "Terms",
      QuestionType: "Legal",
      Role: "consent",
      AnsweredCount: 2,
      Buckets: [
        {
          Label: "Yes",
          Count: 2,
          Fraction: 1
        },
        {
          Label: "No",
          Count: 0,
          Fraction: 0
        }
      ],
      Numeric: null,
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000116",
      Prompt: "Start date",
      QuestionType: "Date",
      Role: "temporal",
      AnsweredCount: 2,
      Buckets: [
        {
          Label: "Sep 2026",
          Count: 1,
          Fraction: 0.5
        },
        {
          Label: "Oct 2026",
          Count: 1,
          Fraction: 0.5
        }
      ],
      Numeric: null,
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000117",
      Prompt: "Best time",
      QuestionType: "Time",
      Role: "temporal",
      AnsweredCount: 2,
      Buckets: [
        {
          Label: "Morning (6am–12pm)",
          Count: 1,
          Fraction: 0.5
        },
        {
          Label: "Afternoon (12–5pm)",
          Count: 1,
          Fraction: 0.5
        }
      ],
      Numeric: null,
      MatrixCells: []
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000118",
      Prompt: "Rate each",
      QuestionType: "Matrix",
      Role: "composite",
      AnsweredCount: 2,
      Buckets: [],
      Numeric: null,
      MatrixCells: [
        {
          RowLabel: "Venue",
          ColumnLabel: "Good",
          Count: 2
        },
        {
          RowLabel: "Venue",
          ColumnLabel: "Poor",
          Count: 1
        },
        {
          RowLabel: "Food",
          ColumnLabel: "Good",
          Count: 0
        },
        {
          RowLabel: "Food",
          ColumnLabel: "Poor",
          Count: 1
        }
      ]
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000130",
      Prompt: "How many?",
      QuestionType: "Number",
      Role: "scale",
      AnsweredCount: 0,
      Buckets: [],
      Numeric: {
        Answered: 0,
        Min: null,
        Max: null,
        Average: null,
        NPSScore: null,
        NPSSegments: null
      },
      MatrixCells: []
    }
  ],
  OpenText: [
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000101",
      Prompt: "Full name",
      QuestionType: "ShortText",
      Answered: 3,
      Skipped: 4,
      ResponseRate: 0.42857142857142855,
      MedianLength: 12,
      Themes: [],
      ThemesApply: false
    },
    {
      QuestionID: "0f0f0f0f-0000-4000-8000-000000000119",
      Prompt: "Anything else?",
      QuestionType: "LongText",
      Answered: 3,
      Skipped: 4,
      ResponseRate: 0.42857142857142855,
      MedianLength: 31,
      Themes: [
        {
          Term: "checkout",
          Answers: 2,
          Fraction: 0.6666666666666666
        },
        {
          Term: "pricing",
          Answers: 2,
          Fraction: 0.6666666666666666
        },
        {
          Term: "slow",
          Answers: 2,
          Fraction: 0.6666666666666666
        }
      ],
      ThemesApply: true
    }
  ],
  Funnel: [
    {
      PageID: "0f0f0f0f-0000-4000-8000-000000000011",
      Title: "Page 1",
      DisplayOrder: 1,
      Reached: 7,
      Retention: 1,
      DropOff: 0
    },
    {
      PageID: "0f0f0f0f-0000-4000-8000-000000000012",
      Title: "Opinions",
      DisplayOrder: 2,
      Reached: 8,
      Retention: 1.1428571428571428,
      DropOff: 0
    },
    {
      PageID: "0f0f0f0f-0000-4000-8000-000000000013",
      Title: "Extra",
      DisplayOrder: 3,
      Reached: 0,
      Retention: 0,
      DropOff: 1
    }
  ]
};
