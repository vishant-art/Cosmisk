CREATE SCHEMA IF NOT EXISTS {{schema}};

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS {{schema}}.brand_contexts (
    id text primary key,
    doc jsonb not null,
    embedding vector(1024),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS {{schema}}.products (
    id text primary key,
    doc jsonb not null,
    embedding vector(1024),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS {{schema}}.campaigns (
    id text primary key,
    doc jsonb not null,
    embedding vector(1024),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS {{schema}}.creative_specs (
    id text primary key,
    doc jsonb not null,
    embedding vector(1024),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS {{schema}}.character_sheets (
    id text primary key,
    doc jsonb not null,
    embedding vector(1024),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS {{schema}}.shot_specs (
    id text primary key,
    doc jsonb not null,
    embedding vector(1024),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS {{schema}}.asset_manifests (
    id text primary key,
    doc jsonb not null,
    embedding vector(1024),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS {{schema}}.qa_reports (
    id text primary key,
    doc jsonb not null,
    embedding vector(1024),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS {{schema}}.generation_runs (
    id text primary key,
    creative_spec_id text not null,
    status text not null,
    steps jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
