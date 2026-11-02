-- 0015 — trust fixes from the full council of 2 Nov 2026 (20261102-155139-d549)
-- 1. A message's time is the SERVER's time: a sender could choose created_at (e.g. far in the future) and pin their
--    message at the top of the order. The client never needs to send it.
-- 2. A stored signature must really be a PNG: the old check only looked at the «data:image/png;base64,» prefix, so a
--    direct API call could store text that no screen can show and the contract still read «signed». (A tap without
--    any stroke is stopped in the app — SignaturePad only emits after a real stroke.)
-- Front-end safe: nothing the app sends today changes. NOT VALID = old rows are not re-checked.

create or replace function messages_server_time() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  return new;
end $$;

drop trigger if exists messages_server_time on messages;
create trigger messages_server_time before insert on messages for each row execute function messages_server_time();

create or replace function is_png_data_url(t text) returns boolean
language plpgsql immutable set search_path = public as $$
declare b bytea;
begin
  if t is null or t not like 'data:image/png;base64,%' or length(t) > 400000 then return false; end if;
  b := decode(substr(t, 23), 'base64');
  return length(b) > 8 and substr(b, 1, 8) = '\x89504e470d0a1a0a'::bytea;
exception when others then
  return false;   -- not base64 at all
end $$;

alter table contract_versions drop constraint if exists contract_versions_first_signature_png;
alter table contract_versions add constraint contract_versions_first_signature_png check (first_signature is null or is_png_data_url(first_signature)) not valid;
alter table contract_versions drop constraint if exists contract_versions_signature_png;
alter table contract_versions add constraint contract_versions_signature_png check (signature is null or is_png_data_url(signature)) not valid;
