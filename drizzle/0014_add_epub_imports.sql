ALTER TABLE projects ADD COLUMN input_source TEXT NOT NULL DEFAULT 'script';
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN epub_import_id TEXT REFERENCES epub_imports(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE shots ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE shots ADD COLUMN source_page_id TEXT REFERENCES epub_pages(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS epub_imports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  original_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT,
  author TEXT,
  cover_path TEXT,
  total_pages INTEGER NOT NULL DEFAULT 0,
  metadata TEXT DEFAULT '{}',
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS epub_pages (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES epub_imports(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  image_path TEXT NOT NULL,
  thumb_path TEXT,
  width INTEGER,
  height INTEGER,
  source_href TEXT,
  source_media_type TEXT,
  is_selected INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS epub_imports_project_id_idx ON epub_imports(project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS epub_pages_import_id_idx ON epub_pages(import_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS shots_source_page_id_idx ON shots(source_page_id);
