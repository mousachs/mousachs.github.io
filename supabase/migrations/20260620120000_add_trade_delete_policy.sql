drop policy if exists "Trade creators can delete trades" on public.trades;

create policy "Trade creators can delete trades"
on public.trades
for delete
to authenticated
using (created_by = auth.uid());
