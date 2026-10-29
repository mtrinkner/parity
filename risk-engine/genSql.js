// Emits idempotent seed SQL for Supabase from the live rule set + engine output.
const fs = require("fs"), path = require("path");
const { screen } = require("./ruleEngine");
const ruleset = require("./rules");
const deal = require("./exampleDeal");
const q = s => (s == null ? "null" : "'" + String(s).replace(/'/g, "''") + "'");
const jb = o => "'" + JSON.stringify(o).replace(/'/g, "''") + "'::jsonb";

const out = screen(deal, ruleset);
const L = [];
L.push("truncate risk_flags, risk_assessments;");
// upsert rules
for (const r of ruleset.RULES) {
  L.push(
`insert into risk_rules (rule_id,name,category,weight,page,why_it_matters,next_action,dd_required,guardrail,params,version,active)
values (${q(r.id)},${q(r.name)},${q(r.category)},${r.weight},${q(r.page)},${q(r.whyItMatters)},${q(r.nextAction)},${!!r.ddRequired},${!!r.guardrail},${jb(r.params||{})},${q(ruleset.RULE_SET_VERSION)},true)
on conflict (rule_id) do update set name=excluded.name,category=excluded.category,weight=excluded.weight,page=excluded.page,why_it_matters=excluded.why_it_matters,next_action=excluded.next_action,dd_required=excluded.dd_required,guardrail=excluded.guardrail,params=excluded.params,version=excluded.version,updated_at=now();`);
}
// assessment + flags in one CTE
const all = [...out.flags, ...out.insufficientData, ...out.passes];
const rows = all.map(f =>
  `(${q(f.ruleId)},${q(f.rule)},${q(f.category)},${q(f.status)},${q(f.severity)},${f.level||"null"},${f.weight},${f.pointsLost},${q(f.evidence)},${q(f.omPage)},${q(f.whyItMatters)},${q(f.financialImpact)},${q(f.recommendedNextAction)},${f.additionalDDRequired},${f.guardrail})`
).join(",\n");
L.push(
`with a as (
  insert into risk_assessments (property_name,source_om,rule_set_version,score,verdict,deal_risk_posture,guardrail_capped,counts)
  values (${q(out.property.name)},${q(out.generatedFrom)},${q(out.ruleSetVersion)},${out.score},${q(out.verdict)},${q(out.dealRiskPosture)},${out.guardrailCapped},${jb(out.counts)})
  returning id
)
insert into risk_flags (assessment_id,rule_id,rule_name,category,status,severity,level,weight,points_lost,evidence,om_page,why_it_matters,financial_impact,recommended_next_action,additional_dd_required,guardrail)
select a.id, f.* from a cross join (values
${rows}
) as f(rule_id,rule_name,category,status,severity,level,weight,points_lost,evidence,om_page,why_it_matters,financial_impact,recommended_next_action,additional_dd_required,guardrail);`);

fs.writeFileSync(path.join(__dirname, "seed.sql"), L.join("\n\n"));
console.log("seed.sql written:", all.length, "flags,", ruleset.RULES.length, "rules");
