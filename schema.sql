-- HireReady Database Schema
-- Run this in Neon SQL Editor (https://console.neon.tech)

-- Users table (from saas-starter-kit)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  password_hash VARCHAR(255),
  is_admin BOOLEAN DEFAULT false,
  email_verified BOOLEAN DEFAULT false,
  verification_token VARCHAR(255),
  google_id VARCHAR(255),
  auth_provider VARCHAR(50) DEFAULT 'email',
  reset_token VARCHAR(255),
  reset_token_expires TIMESTAMP,
  plan VARCHAR(20) DEFAULT 'none',
  plan_expires TIMESTAMP,
  target_country VARCHAR(50) DEFAULT 'CA',
  preferred_lang VARCHAR(5) DEFAULT 'en',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Make password_hash nullable for Google OAuth users
DO $$ 
BEGIN 
  ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Resumes table
CREATE TABLE IF NOT EXISTS resumes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) DEFAULT 'My Resume',
  full_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  location VARCHAR(255),
  linkedin_url VARCHAR(500),
  summary TEXT,
  experience JSONB DEFAULT '[]',
  education JSONB DEFAULT '[]',
  skills JSONB DEFAULT '[]',
  certifications JSONB DEFAULT '[]',
  languages JSONB DEFAULT '[]',
  target_country VARCHAR(50) DEFAULT 'CA',
  version INTEGER DEFAULT 1,
  is_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ATS analyses
CREATE TABLE IF NOT EXISTS ats_analyses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE,
  job_title VARCHAR(255),
  company_name VARCHAR(255),
  job_description TEXT,
  ats_score INTEGER DEFAULT 0,
  missing_keywords JSONB DEFAULT '[]',
  missing_skills JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  optimized_resume JSONB,
  cover_letter TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Interview sessions
CREATE TABLE IF NOT EXISTS interview_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  analysis_id INTEGER REFERENCES ats_analyses(id) ON DELETE SET NULL,
  job_title VARCHAR(255),
  job_description TEXT,
  question_count INTEGER DEFAULT 0,
  avg_score NUMERIC(3,1) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Interview Q&A
CREATE TABLE IF NOT EXISTS interview_qa (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_number INTEGER,
  question_type VARCHAR(50),
  question TEXT,
  user_answer TEXT,
  ai_feedback TEXT,
  score INTEGER,
  suggested_answer TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usage tracking
CREATE TABLE IF NOT EXISTS usage_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(50),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin activity log
CREATE TABLE IF NOT EXISTS admin_activity_log (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES users(id),
  action VARCHAR(100),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON ats_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_resume ON ats_analyses(resume_id);
CREATE INDEX IF NOT EXISTS idx_interviews_user ON interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_qa_session ON interview_qa(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_log(user_id);

-- Verify tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
