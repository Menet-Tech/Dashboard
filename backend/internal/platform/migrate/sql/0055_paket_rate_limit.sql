-- Add rate_limit column to paket table for MikroTik burst rate-limit string support
-- Format: rx-rate[/tx-rate] [rx-burst-rate[/tx-burst-rate] [rx-burst-threshold[/tx-burst-threshold] [rx-burst-time[/tx-burst-time]]]]
-- Example: "10M/10M 50M/50M 10M/10M 10/10"
ALTER TABLE paket ADD COLUMN rate_limit TEXT NOT NULL DEFAULT '';
