begin;
alter table public.m4x_theme_paid_jobs add column if not exists mode text not null default 'full';
update public.m4x_theme_paid_jobs set mode='full' where mode is null or mode not in ('text','scan','full');
alter table public.m4x_theme_paid_jobs drop constraint if exists m4x_theme_paid_jobs_mode_check;
alter table public.m4x_theme_paid_jobs add constraint m4x_theme_paid_jobs_mode_check check (mode in ('text','scan','full'));
notify pgrst, 'reload schema';
commit;
select 'M4X V21.6 modes installed' as result;
