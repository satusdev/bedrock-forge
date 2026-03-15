CREATE TABLE IF NOT EXISTS sync_task_statuses (
	id SERIAL PRIMARY KEY,
	task_id VARCHAR(64) NOT NULL,
	project_id INTEGER NULL,
	task_kind VARCHAR(120) NULL,
	status VARCHAR(40) NOT NULL,
	message TEXT NOT NULL,
	progress INTEGER NOT NULL DEFAULT 0,
	result JSON NULL,
	logs TEXT NULL,
	started_at TIMESTAMPTZ NULL,
	completed_at TIMESTAMPTZ NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT uq_sync_task_statuses_task_id UNIQUE (task_id)
);

CREATE INDEX IF NOT EXISTS ix_sync_task_statuses_project_id
	ON sync_task_statuses (project_id);

CREATE INDEX IF NOT EXISTS ix_sync_task_statuses_status
	ON sync_task_statuses (status);

CREATE INDEX IF NOT EXISTS ix_sync_task_statuses_updated_at
	ON sync_task_statuses (updated_at);
