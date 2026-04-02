-- Property image uploads for landlord property forms

insert into storage.buckets (id, name, public)
values ('property-images', 'property-images', true)
on conflict (id) do nothing;

create policy "Public can view property images"
on storage.objects
for select
to public
using (bucket_id = 'property-images');

create policy "Authenticated users can upload property images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'property-images' and owner = auth.uid());

create policy "Authenticated users can update own property images"
on storage.objects
for update
to authenticated
using (bucket_id = 'property-images' and owner = auth.uid())
with check (bucket_id = 'property-images' and owner = auth.uid());

create policy "Authenticated users can delete own property images"
on storage.objects
for delete
to authenticated
using (bucket_id = 'property-images' and owner = auth.uid());