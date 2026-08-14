-- Reports are public-by-default: anyone with the (unguessable UUID) link can view.
alter table public.reports
  add column if not exists is_public boolean not null default true;

-- Permissive policies: they OR with the existing member-only policies and also
-- apply to the anon role, so signed-out visitors can load shared report links.
-- Write policies (insert/update/delete) stay member-only.
create policy "Public reports are viewable by anyone" on public.reports
  for select using (is_public);

create policy "Public report events are viewable by anyone" on public.report_events
  for select using (
    report_id in (select id from public.reports where is_public)
  );
