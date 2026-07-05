-- Cloudflare R2 Workspace Settings Columns
alter table public.workspaces add column if not exists r2_endpoint text;
alter table public.workspaces add column if not exists r2_access_key_id text;
alter table public.workspaces add column if not exists r2_secret_access_key text;
alter table public.workspaces add column if not exists r2_bucket_name text;
alter table public.workspaces add column if not exists r2_public_domain text;

-- Workspace Owner Update Policy
create policy "Owners can update workspace settings" on public.workspaces
  for update using (
    id in (
      select workspace_id from public.workspace_members 
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- Cloudflare R2 Personal/Member Settings Table
create table if not exists public.user_r2_settings (
  user_id uuid references auth.users(id) on delete cascade primary key,
  r2_endpoint text,
  r2_access_key_id text,
  r2_secret_access_key text,
  r2_bucket_name text,
  r2_public_domain text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for user_r2_settings
alter table public.user_r2_settings enable row level security;

-- Policies for user_r2_settings
create policy "Users can view their own r2 settings" on public.user_r2_settings
  for select using (auth.uid() = user_id);
create policy "Users can insert their own r2 settings" on public.user_r2_settings
  for insert with check (auth.uid() = user_id);
create policy "Users can update their own r2 settings" on public.user_r2_settings
  for update using (auth.uid() = user_id);
