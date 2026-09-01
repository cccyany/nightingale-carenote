do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'resolve_fact_conflict(uuid,text,text,conflict_status,fact_entity_type,text,text,text,assertion_value)'::regprocedure
  ) into function_definition;

  function_definition := replace(
    function_definition,
    $$corrected_start + length(corrected_evidence),
      'conflict resolution decision'$$,
    $$corrected_start + length(corrected_evidence),
      'entry',
      'conflict resolution decision'$$
  );

  execute function_definition;
end
$migration$;

grant execute on function resolve_fact_conflict(uuid, text, text, conflict_status, fact_entity_type, text, text, text, assertion_value) to authenticated;
