-- Migratie 01: gebruikers en rollen
--
-- Draai dit één keer in de SQL Editor van Supabase als je de databank al had
-- opgezet vóór het gebruikersbeheer bestond. Bij een nieuwe installatie zit
-- alles al in schema.sql en hoef je dit niet apart te doen.
--
-- Het script is idempotent: opnieuw draaien kan geen kwaad.

create table if not exists app_users (
  id            uuid primary key default gen_random_uuid(),
  email         text        not null,
  name          text,
  role          text        not null default 'kijker',
  company_id    uuid        references companies (id) on delete cascade,
  invited_by    text,
  invited_at    timestamptz not null default now(),
  last_login_at timestamptz,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint app_users_role_check
    check (role in ('hoofdbeheerder', 'vennootschapsbeheerder', 'kijker')),

  -- Een hoofdbeheerder kijkt over alle vennootschappen heen en hangt dus aan
  -- geen enkele. Wie dat niet is, hoort altijd bij precies één vennootschap.
  constraint app_users_company_check check (
    (role = 'hoofdbeheerder' and company_id is null)
    or (role <> 'hoofdbeheerder' and company_id is not null)
  )
);

create unique index if not exists app_users_email_key on app_users (lower(email));
create index if not exists app_users_company_idx on app_users (company_id);

drop trigger if exists app_users_set_updated_at on app_users;
create trigger app_users_set_updated_at
  before update on app_users
  for each row execute function set_updated_at();

alter table app_users enable row level security;
