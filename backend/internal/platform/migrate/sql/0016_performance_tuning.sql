-- Create index to speed up referred-by customer lookups/joins
CREATE INDEX IF NOT EXISTS idx_pelanggan_referred_by_id ON pelanggan(referred_by_id);

-- Create indices to speed up action_logs query performance and joins
CREATE INDEX IF NOT EXISTS idx_action_logs_user_id ON action_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_pelanggan_id ON action_logs(pelanggan_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_action ON action_logs(action);
