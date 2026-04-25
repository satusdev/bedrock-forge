-- Insert the maintainer role if it doesn't already exist
INSERT INTO roles (name) VALUES ('maintainer') ON CONFLICT (name) DO NOTHING;
