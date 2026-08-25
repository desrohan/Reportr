-- Only the creator of a report may rename or delete it.
-- report_events rows are removed automatically via the FK on delete cascade.
create policy "Creators can update their own reports" on public.reports
  for update using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "Creators can delete their own reports" on public.reports
  for delete using (auth.uid() = created_by);
