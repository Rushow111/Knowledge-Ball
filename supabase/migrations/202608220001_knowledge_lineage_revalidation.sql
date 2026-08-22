
-- Knowledge Lineage V3: wire the already-frozen ORIGINAL_DESIGN_V1 second verification.
-- No challenge policy constants are redefined here: stage 0 is the existing 10-energy GLOBAL challenge.
alter table public.public_knowledge_events drop constraint if exists public_knowledge_events_event_type_check;
alter table public.public_knowledge_events add constraint public_knowledge_events_event_type_check check (event_type in (
  'NodeCreated','NodeEdited','NodeFalsified','NodeSuspended','NodeDisputed','NodeResolved','KnowledgeAdded','KnowledgeNegated','KnowledgeDecomposed','KnowledgeMerged','KnowledgeStatusChanged','KnowledgeNodeEdited','KnowledgeRevalidationStarted','KnowledgeVerdictFinalized'));

alter table public.knowledge_pending_vote_rounds add column if not exists round_kind text not null default 'INITIAL';
alter table public.knowledge_pending_vote_rounds add column if not exists challenge_stage integer;
alter table public.knowledge_pending_vote_rounds add column if not exists initiator_stake numeric(30,6) not null default 1.000000;
alter table public.knowledge_pending_vote_rounds add column if not exists source_node_id text;
alter table public.knowledge_pending_vote_rounds drop constraint if exists knowledge_pending_vote_rounds_round_kind_check;
alter table public.knowledge_pending_vote_rounds add constraint knowledge_pending_vote_rounds_round_kind_check check(round_kind in('INITIAL','CHALLENGE','CASCADE'));
alter table public.knowledge_pending_vote_rounds alter column initiator_id drop not null;
alter table public.knowledge_pending_vote_rounds alter column initiator_side drop not null;
alter table public.knowledge_pending_vote_rounds drop constraint if exists knowledge_pending_vote_rounds_initiator_side_check;
alter table public.knowledge_pending_vote_rounds add constraint knowledge_pending_vote_rounds_initiator_side_check check(initiator_side is null or initiator_side in('AGREE','DISAGREE'));
alter table public.knowledge_pending_votes drop constraint if exists knowledge_pending_votes_node_id_voter_id_key;
alter table public.knowledge_pending_votes add constraint knowledge_pending_votes_round_id_voter_id_key unique(round_id,voter_id);

alter table public.energy_transactions drop constraint if exists energy_transactions_transaction_type_check;
alter table public.energy_transactions add constraint energy_transactions_transaction_type_check check(transaction_type in('REFERRAL','SPEND','TRANSFER','VOTE_STAKE','CLAIM_STAKE','CHALLENGE_STAKE','VOTE_SETTLEMENT'));

create or replace function public.latest_pending_vote_round(target_node_id text) returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  select id from public.knowledge_pending_vote_rounds where node_id=target_node_id and verdict='PENDING' order by round_no desc limit 1
$$;

create or replace function public.pending_vote_snapshot(target_node_id text) returns jsonb language plpgsql security definer stable set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); r public.knowledge_pending_vote_rounds%rowtype; agree_count integer; disagree_count integer; my_side text; my_balance numeric(30,6);
begin
  if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into r from public.knowledge_pending_vote_rounds where node_id=target_node_id order by round_no desc limit 1;
  if not found then raise exception 'pending vote round not found' using errcode='22023'; end if;
  select count(*) filter(where side='AGREE' and settlement_status='ACTIVE'),count(*) filter(where side='DISAGREE' and settlement_status='ACTIVE') into agree_count,disagree_count from public.knowledge_pending_votes where round_id=r.id;
  select side into my_side from public.knowledge_pending_votes where round_id=r.id and voter_id=actor and settlement_status='ACTIVE';
  select balance into my_balance from public.energy_accounts where user_id=actor;
  return jsonb_build_object('node_id',target_node_id,'round_id',r.id::text,'round_no',r.round_no,'round_kind',r.round_kind,'challenge_stage',r.challenge_stage,'stake',r.initiator_stake::text,'agree_count',agree_count,'disagree_count',disagree_count,'required_votes',r.required_votes,'my_side',my_side,'my_balance',case when my_balance is null then null else my_balance::text end,'verdict',r.verdict,'close_reason',r.close_reason,'deadline',r.deadline,'closed_at',r.closed_at,'policy_version',r.policy_version);
end $$;

create or replace function public.emit_revalidation_started(r public.knowledge_pending_vote_rounds) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e jsonb; actor uuid:=coalesce(r.initiator_id,auth.uid());
begin
  e:=jsonb_build_object('id','revalidation-start:'||r.id::text,'type','KnowledgeRevalidationStarted','scope','public','schemaVersion',1,'timestamp',floor(extract(epoch from clock_timestamp())*1000)::bigint,'payload',jsonb_build_object('roundId',r.id::text,'nodeId',r.node_id,'kind',case when r.round_kind='CHALLENGE' then 'challenge' else 'cascade' end,'stage',coalesce(r.challenge_stage,0),'stake',r.initiator_stake::text,'policyVersion',r.policy_version));
  insert into public.public_knowledge_events(event_id,schema_version,event_type,envelope,actor_id) values(e->>'id',1,'KnowledgeRevalidationStarted',e,actor) on conflict(event_id) do nothing;
end $$;

create or replace function public.start_second_knowledge_verification(target_node_id text,operation_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); account uuid; r public.knowledge_pending_vote_rounds%rowtype; next_round integer; snapshot bigint; tx uuid; stake numeric(30,6):=10.000000; request_hash text;
begin
  if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  if nullif(target_node_id,'') is null or nullif(operation_key,'') is null then raise exception 'node id and idempotency key required' using errcode='22023'; end if;
  perform public.ensure_anonymous_profile(); perform pg_advisory_xact_lock(hashtextextended('second-verification:'||target_node_id,0));
  select * into r from public.knowledge_pending_vote_rounds where node_id=target_node_id and verdict='PENDING' order by round_no desc limit 1;
  if found then return public.pending_vote_snapshot(target_node_id); end if;
  if not exists(select 1 from public.knowledge_pending_vote_rounds where node_id=target_node_id and verdict in('CORRECT','INCORRECT')) then raise exception 'first verification has not finalized' using errcode='22023'; end if;
  select coalesce(max(round_no),0)+1 into next_round from public.knowledge_pending_vote_rounds where node_id=target_node_id;
  select greatest(count(*),1)::bigint into snapshot from public.knowledge_ball_profiles where active;
  select id into account from public.energy_accounts where user_id=actor for update; if account is null then raise exception 'energy account not found'; end if;
  update public.energy_accounts set balance=balance-stake where id=account and balance-stake>=-10.000000; if not found then raise exception 'insufficient energy' using errcode='23514'; end if;
  request_hash:=encode(sha256(convert_to(jsonb_build_object('node_id',target_node_id,'round_no',next_round,'stage',0,'stake',stake::text,'scope','GLOBAL')::text,'UTF8')),'hex');
  insert into public.energy_transactions(transaction_type,idempotency_key,metadata,actor_id,request_hash) values('CHALLENGE_STAKE',operation_key,jsonb_build_object('operation','SECOND_VERIFICATION','node_id',target_node_id,'stage',0,'scope','GLOBAL','stake',stake::text),actor,request_hash) on conflict(actor_id,transaction_type,idempotency_key) do nothing returning id into tx;
  if tx is null then select id into tx from public.energy_transactions where actor_id=actor and transaction_type='CHALLENGE_STAKE' and idempotency_key=operation_key; end if;
  insert into public.energy_ledger_entries(transaction_id,account_id,amount) values(tx,account,-stake),(tx,'00000000-0000-0000-0000-000000000001',stake) on conflict do nothing;
  update public.energy_accounts set balance=balance+stake where account_type='SYSTEM';
  insert into public.knowledge_pending_vote_rounds(node_id,round_no,policy_version,initiator_id,initiator_side,eligible_user_snapshot,required_votes,opened_at,deadline,creator_stake_transaction_id,legacy_unfunded,round_kind,challenge_stage,initiator_stake)
    values(target_node_id,next_round,'ORIGINAL_DESIGN_V1',actor,'AGREE',snapshot,public.pending_vote_required_for_snapshot(snapshot),clock_timestamp(),clock_timestamp()+interval '720 hours',tx,false,'CHALLENGE',0,stake) returning * into r;
  perform public.emit_revalidation_started(r); perform public.assert_energy_conservation(); return public.pending_vote_snapshot(target_node_id);
end $$;

create or replace function public.start_cascade_knowledge_verification(target_node_id text,source_node_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.knowledge_pending_vote_rounds%rowtype; next_round integer; snapshot bigint;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cascade-verification:'||target_node_id,0));
  select * into r from public.knowledge_pending_vote_rounds where node_id=target_node_id and verdict='PENDING' order by round_no desc limit 1; if found then return public.pending_vote_snapshot(target_node_id); end if;
  select coalesce(max(round_no),0)+1 into next_round from public.knowledge_pending_vote_rounds where node_id=target_node_id;
  select greatest(count(*),1)::bigint into snapshot from public.knowledge_ball_profiles where active;
  insert into public.knowledge_pending_vote_rounds(node_id,round_no,policy_version,initiator_id,initiator_side,eligible_user_snapshot,required_votes,opened_at,deadline,legacy_unfunded,round_kind,challenge_stage,initiator_stake,source_node_id)
    values(target_node_id,next_round,'ORIGINAL_DESIGN_V1',null,null,snapshot,public.pending_vote_required_for_snapshot(snapshot),clock_timestamp(),clock_timestamp()+interval '720 hours',true,'CASCADE',null,0.000000,source_node_id) returning * into r;
  perform public.emit_revalidation_started(r); return public.pending_vote_snapshot(target_node_id);
end $$;

-- Use the latest PENDING round for both first and later verification. Ordinary votes remain exactly 1 energy.
create or replace function public.get_pending_knowledge_vote(target_node_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  rid:=public.latest_pending_vote_round(target_node_id); if rid is null then rid:=public.pending_vote_round_for_node(target_node_id); end if;
  perform public.finalize_pending_vote_round(rid); return public.pending_vote_snapshot(target_node_id);
end $$;

-- Patch vote casting to target the latest open round and allow the same person in later rounds.
create or replace function public.cast_pending_knowledge_vote(target_node_id text,vote_side text,operation_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); account uuid; tx uuid; existing_side text; stake numeric(30,6):=1.000000; request_hash text; rid uuid; r public.knowledge_pending_vote_rounds%rowtype;
begin
  if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  if vote_side not in('AGREE','DISAGREE') then raise exception 'invalid vote side' using errcode='22023'; end if;
  perform public.ensure_anonymous_profile(); perform pg_advisory_xact_lock(hashtextextended('pending-vote:'||target_node_id,0));
  rid:=public.latest_pending_vote_round(target_node_id); if rid is null then rid:=public.pending_vote_round_for_node(target_node_id); end if;
  perform public.finalize_pending_vote_round(rid); select * into r from public.knowledge_pending_vote_rounds where id=rid;
  if r.verdict<>'PENDING' then return public.pending_vote_snapshot(target_node_id); end if;
  if r.initiator_id=actor then raise exception 'claim creator cannot cast an ordinary vote on the same round' using errcode='42501'; end if;
  select side into existing_side from public.knowledge_pending_votes where round_id=rid and voter_id=actor and settlement_status='ACTIVE'; if found then return public.pending_vote_snapshot(target_node_id); end if;
  select id into account from public.energy_accounts where user_id=actor for update; update public.energy_accounts set balance=balance-stake where id=account and balance-stake>=-10.000000; if not found then raise exception 'insufficient energy' using errcode='23514'; end if;
  request_hash:=encode(sha256(convert_to(jsonb_build_object('node_id',target_node_id,'round_id',rid::text,'side',vote_side,'stake',stake::text)::text,'UTF8')),'hex');
  insert into public.energy_transactions(transaction_type,idempotency_key,metadata,actor_id,request_hash) values('VOTE_STAKE',operation_key||':'||rid::text,jsonb_build_object('operation','PENDING_VOTE','node_id',target_node_id,'round_id',rid::text,'side',vote_side,'stake',stake::text),actor,request_hash) returning id into tx;
  insert into public.energy_ledger_entries(transaction_id,account_id,amount) values(tx,account,-stake),(tx,'00000000-0000-0000-0000-000000000001',stake); update public.energy_accounts set balance=balance+stake where account_type='SYSTEM';
  insert into public.knowledge_pending_votes(node_id,round_id,voter_id,side,stake,transaction_id) values(target_node_id,rid,actor,vote_side,stake,tx);
  perform public.finalize_pending_vote_round(rid); perform public.assert_energy_conservation(); return public.pending_vote_snapshot(target_node_id);
end $$;

grant execute on function public.start_second_knowledge_verification(text,text) to authenticated;
grant execute on function public.start_cascade_knowledge_verification(text,text) to authenticated;
