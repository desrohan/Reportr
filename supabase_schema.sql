-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Workspaces Table
create table public.workspaces (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  invite_code text unique not null,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Workspace Members Table
create table public.workspace_members (
  id uuid default uuid_generate_v4() primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text check (role in ('owner', 'member')) default 'member' not null,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(workspace_id, user_id)
);

-- Reports Table
create table public.reports (
  id uuid default uuid_generate_v4() primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  created_by uuid references auth.users(id) on delete cascade not null,
  video_url text,
  title text,
  status text default 'new',
  is_public boolean not null default true, -- anyone with the link can view
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Report Events Table (for the timeline steps)
create table public.report_events (
  id uuid default uuid_generate_v4() primary key,
  report_id uuid references public.reports(id) on delete cascade not null,
  timestamp_ms bigint not null,
  type text not null, -- network, console, click, navigate, input
  data jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Security definer helper to bypass RLS recursion
create or replace function public.get_workspaces_for_user(usr_id uuid)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select workspace_id from public.workspace_members where user_id = usr_id;
$$;

-- Workspaces: Members can view
alter table public.workspaces enable row level security;
create policy "Users can view workspaces they are members of" on public.workspaces
  for select using (
    id in (select public.get_workspaces_for_user(auth.uid()))
  );
create policy "Users can view workspaces they created" on public.workspaces
  for select using (auth.uid() = created_by);
-- Anyone can create a workspace
create policy "Users can create workspaces" on public.workspaces
  for insert with check (auth.uid() is not null);

-- Workspace Members: Members can view other members
alter table public.workspace_members enable row level security;
create policy "Members can view other members" on public.workspace_members
  for select using (
    workspace_id in (select public.get_workspaces_for_user(auth.uid()))
  );
create policy "Users can join a workspace" on public.workspace_members
  for insert with check (auth.uid() = user_id);

-- Reports: Members can view and insert reports
alter table public.reports enable row level security;
create policy "Members can view reports" on public.reports
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );
create policy "Members can insert reports" on public.reports
  for insert with check (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
    and auth.uid() = created_by
  );


-- Report Events: Members can view and insert
alter table public.report_events enable row level security;
create policy "Members can view report events" on public.report_events
  for select using (
    report_id in (select id from public.reports where workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()))
  );
create policy "Members can insert report events" on public.report_events
  for insert with check (
    report_id in (select id from public.reports where workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()))
  );

-- Public sharing: anyone with the report link (signed in or not) can view the
-- report and its events. Write policies stay member-only.
create policy "Public reports are viewable by anyone" on public.reports
  for select using (is_public);
create policy "Public report events are viewable by anyone" on public.report_events
  for select using (
    report_id in (select id from public.reports where is_public)
  );

-- Only the creator of a report may rename or delete it.
-- report_events rows are removed automatically via the FK on delete cascade.
create policy "Creators can update their own reports" on public.reports
  for update using (auth.uid() = created_by)
  with check (auth.uid() = created_by);
create policy "Creators can delete their own reports" on public.reports
  for delete using (auth.uid() = created_by);

