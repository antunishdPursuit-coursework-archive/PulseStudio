-- Pulse Studio — the sign-in schema for the HOSTED version. Postgres (pg).
--
-- The static build you are reading this from has no server, so its sign-in
-- is a browser-local test session (see ./session.ts) — for testing purposes.
-- When Pulse Studio is sold and hosted, this file is the database the same
-- sign-in talks to. Nothing conceptual changes: the session shape in
-- session.ts and the rows here use THE SAME identifier names, taken from
-- app/shared/contract.ts — member_id, display_name, membership_status,
-- email. Swapping test mode for pg changes where a session comes from, not
-- what a session is.
--
-- Run with: psql "$DATABASE_URL" -f app/shared/auth/schema.sql

begin;

-- citext makes emails compare case-insensitively (Maria@x = maria@x —
-- the same rule Product D's engine already applies when joining on email).
create extension if not exists citext;
-- pgcrypto provides crypt() and gen_salt() for password hashing. Passwords
-- are ONLY ever stored as hashes; plaintext never touches a table.
create extension if not exists pgcrypto;

-- members mirrors the Member interface in app/shared/contract.ts, plus the
-- email that the identity law keys a person by. The check constraint is the
-- MembershipStatus union, verbatim.
create table members (
  member_id         text primary key,
  display_name      text not null,
  membership_status text not null
    check (membership_status in ('active', 'paused', 'canceled', 'expired')),
  email             citext unique
);

-- logins is where "how does anyone have the login" lives: one row per
-- person who may sign in. The AUTHORITATIVE identity is member_id (the
-- immutable shared member id) — email here is the login credential and
-- contact address, unique so it can locate exactly one login, never a
-- replacement for the member id. member_id is null for staff who are not
-- members — the same split session.ts's v1 contract carries in test mode
-- (actor_type "staff" with a staff_id, no membership invented).
create table logins (
  email         citext primary key,
  member_id     text references members (member_id),
  password_hash text not null,
  role          text not null check (role in ('member', 'staff')),
  created_at    timestamptz not null default now()
);

-- sessions is the hosted replacement for the browser's pulse-session key:
-- a server-issued token the site stores instead of a raw identity, so
-- signing out (or expiry) is enforced by the database, not by politeness.
create table sessions (
  session_token text primary key,
  email         citext not null references logins (email),
  signed_in_at  timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index sessions_expires_at on sessions (expires_at);

commit;

-- Seeding a staff login (run by the studio owner, never committed):
--   insert into logins (email, member_id, password_hash, role)
--   values ('frontdesk@example-studio.com', null,
--           crypt('their-chosen-password', gen_salt('bf')), 'staff');
--
-- Verifying a password at sign-in (the whole check is one comparison —
-- crypt() re-hashes the attempt with the stored salt):
--   select email, member_id, role
--   from logins
--   where email = $1
--     and password_hash = crypt($2, password_hash);
--
-- Members get logins the same way when the studio invites them; their
-- member_id ties the login to the membership the products already know.
