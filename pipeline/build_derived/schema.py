#!/usr/bin/env python3
"""D 区 SQLite DDL — data_cleaning_spec_shandong_v1.md §1 (v1.2)。执行 agent 只 import。"""

DDL_T1_ADMISSION_LINES = """
CREATE TABLE IF NOT EXISTS admission_lines (
    year INTEGER NOT NULL,
    round INTEGER NOT NULL,
    level TEXT NOT NULL,
    school_code TEXT NOT NULL,
    school_name_raw TEXT NOT NULL,
    school_name_norm TEXT NOT NULL,
    major_code TEXT NOT NULL,
    major_name_raw TEXT NOT NULL,
    major_base TEXT NOT NULL,
    annotations_json TEXT NOT NULL,
    plan_count INTEGER NOT NULL,
    min_rank INTEGER,
    min_rank_censor TEXT NOT NULL CHECK (min_rank_censor IN ('exact','le','missing')),
    source_file TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    PRIMARY KEY (year, round, level, school_code, major_code)
);
"""

DDL_T2_SCORE_RANK = """
CREATE TABLE IF NOT EXISTS score_rank (
    year INTEGER NOT NULL,
    subject_pool TEXT NOT NULL,
    score INTEGER NOT NULL,
    count_at INTEGER NOT NULL,
    cum_count INTEGER NOT NULL,
    censor TEXT NOT NULL DEFAULT 'exact' CHECK (censor IN ('exact','head_aggregate')),
    source_file TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    PRIMARY KEY (year, subject_pool, score)
);
"""

DDL_T3_PLANS = """
CREATE TABLE IF NOT EXISTS plans (
    year INTEGER NOT NULL,
    round INTEGER NOT NULL,
    school_code TEXT NOT NULL,
    school_name TEXT NOT NULL,
    major_code TEXT NOT NULL,
    major_name TEXT NOT NULL,
    plan_count INTEGER NOT NULL,
    subject_req_raw TEXT,
    subject_req_norm TEXT,
    level TEXT,
    source_file TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    PRIMARY KEY (year, round, school_code, major_code)
);
"""

DDL_T4_BATCH_LINES = """
CREATE TABLE IF NOT EXISTS batch_lines (
    year INTEGER NOT NULL,
    line_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    source_doc TEXT NOT NULL,
    PRIMARY KEY (year, line_name)
);
"""

DDL_T5_ENTITY_XWALK = """
CREATE TABLE IF NOT EXISTS entity_xwalk (
    entity_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    school_code TEXT NOT NULL,
    major_code TEXT NOT NULL,
    match_method TEXT NOT NULL CHECK (match_method IN ('M1','M2','M3-manual')),
    match_confidence REAL NOT NULL,
    PRIMARY KEY (year, school_code, major_code),
    UNIQUE (entity_id, year)
);
"""

DDL_T6_EXCEPTIONS_LEDGER = """
CREATE TABLE IF NOT EXISTS exceptions_ledger (
    source_file TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    reason_code TEXT NOT NULL CHECK (reason_code IN (
        'UNKNOWN_RANK_FORMAT','EMPTY_RANK','MAJOR_SPLIT_FAIL','SCHOOL_SPLIT_FAIL',
        'PAREN_UNBALANCED','UNKNOWN_ANNOTATION','BAD_PLAN_COUNT','HEADER_UNRECOGNIZED',
        'DUP_PRIMARY_KEY','SHEET_STRUCTURE_UNEXPECTED','SUBJECT_REQ_UNPARSED',
        'IMAGE_TRANSCRIBED')),
    raw_content TEXT NOT NULL,
    stage TEXT NOT NULL,
    resolution TEXT
);
"""

ALL_DDL = [DDL_T1_ADMISSION_LINES, DDL_T2_SCORE_RANK, DDL_T3_PLANS,
           DDL_T4_BATCH_LINES, DDL_T5_ENTITY_XWALK, DDL_T6_EXCEPTIONS_LEDGER]
