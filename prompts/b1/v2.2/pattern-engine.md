
MÓDULO ACTUAL: PATTERN ENGINE

Tu salida NO es el reporte humano.

Tu tarea es construir:
1. COVERAGE MATRIX;
2. FINDINGS CONTROLADOS;
3. CROSS-VARIABLE RELATIONS;
4. PATTERN OBJECTS;
5. HANDOFFS.

========================================================
A. ORDEN DE TRABAJO OBLIGATORIO
========================================================

FASE 1 — COVERAGE
Recorre todas las variables/facetas antes de priorizar.

FASE 2 — FINDINGS
Formula findings controlados por constructo/faceta.

FASE 3 — CONTRAEVIDENCIA
Busca limitaciones, moderadores y explicaciones alternativas.

FASE 4 — CROSS-VARIABLE PASS
Cruza findings ya autorizados.

FASE 5 — PRIMARY PATTERN CANDIDATES
Genera configuraciones integradas primarias.

FASE 6 — SECOND-ORDER PATTERN PASS
Busca combinaciones de 3+ findings/patrones que produzcan una implicación nueva
para selección, sostenibilidad, matching, descarte o due diligence.
No fuerces un patrón de segundo orden.

FASE 7 — MATERIALITY
Prioriza únicamente después del mapa completo y del second-order pass.

FASE 8 — SELECCIÓN
Selecciona de 4 a 6 patrones materiales para el reporte.
No fuerces 6 si no existen.
No reduzcas a 4 si omites algo crítico.

========================================================
B. MATERIALIDAD
========================================================

Prioriza patrones que podrían cambiar:

- rol del propietario;
- tipo de exigencia operativa;
- sostenibilidad cotidiana;
- tolerancia a repetición/mantenimiento;
- exposición a conflicto;
- decisión bajo incertidumbre;
- autonomía necesaria;
- matching posterior;
- forma en que la persona evalúa o selecciona oportunidades;
- criterio futuro de descarte;
- pregunta material de due diligence.

FILTRO OBLIGATORIO:
“Si este patrón es verdadero, ¿qué decisión futura dentro de Kriterial podría cambiar?”

NO priorices por:
- dramatismo;
- longitud de una abierta;
- rareza anecdótica;
- lo fácil que sea redactarlo.

========================================================
C. PATTERN OBJECT
========================================================

Cada patrón debe incluir:

- pattern_id
- pattern_level (PRIMARY | SECOND_ORDER)
- titulo_humano
- mechanism_summary
- constructos_facetas
- evidence_ids
- independence_groups
- supporting_evidence
- counterevidence
- alternative_explanations
- moderators
- contextos_activadores
- tipo_relacion
- contradiction_status
- evidence_sufficient
- component_certainty
- certainty_resolution
- certeza
- how_it_manifests
- beneficio_contextual
- costo_contextual
- relevancia_empresarial
- inference_limit
- handoff_si_aplica
- materiality_reason
- future_kriterial_decision_impacted
- report_eligible

========================================================
D. COVERAGE CHECK
========================================================

Antes de devolver JSON confirma internamente:

- ¿alguna respuesta abierta está dominando excesivamente?
- ¿alguna faceta con varias señales quedó omitida?
- ¿separé reconocimiento/estatus de logro/maestría?
- ¿separé uso de contactos de dependencia/reconocimiento?
- ¿separé actividad de estimulación?
- ¿separé consideración interpersonal de acomodación?
- ¿separé persistencia de tolerancia al estrés?
- ¿separé idioma de competencia lingüística?
- ¿separé interés de capacidad?
- ¿separé historia de patrón transversal?
- ¿cada componente esencial del patrón tiene su propia certeza?
- ¿la certeza final respeta el componente esencial menos respaldado?
- ¿alguna discrepancia CON/CST/TMP/SRC/SEM ya fue resuelta y debería terminar
  como contradiction_status = NONE?
- ¿algún título o síntesis usa “capacidad” sin que B1 la haya medido?
- ¿busqué explícitamente un patrón de segundo orden sin forzarlo?
- ¿cada patrón principal puede explicar qué decisión futura de Kriterial podría cambiar?
- ¿nombré algún moderador con más especificidad que la evidencia?
- ¿el candidato ya reconoce directamente el supuesto punto ciego?

========================================================
E. JSON DE SALIDA
========================================================

Devuelve SOLO JSON válido:

{
  "PATTERN_ANALYSIS": {
    "coverage_status": "COMPLETE",
    "coverage_notes": [
      {
        "family": "...",
        "supporting_signals": ["..."],
        "counter_signals": ["..."],
        "moderators": ["..."],
        "status": "SUPPORTED | MIXED | INSUFFICIENT"
      }
    ],
    "candidate_summary_internal": "...",
    "patterns": [
      {
        "pattern_id": "P01",
        "pattern_level": "PRIMARY | SECOND_ORDER",
        "titulo_humano": "...",
        "mechanism_summary": "...",
        "constructos_facetas": ["..."],
        "evidence_ids": ["..."],
        "independence_groups": ["..."],
        "supporting_evidence": ["..."],
        "counterevidence": ["..."],
        "alternative_explanations": ["..."],
        "moderators": ["..."],
        "contextos_activadores": ["..."],
        "tipo_relacion": "CONVERGENCE | FUNCTIONAL_TENSION | CONDITIONALITY | INDEPENDENCE",
        "contradiction_status": "NONE | SEM | CON | TMP | CST | SRC | MAT",
        "evidence_sufficient": true,
        "component_certainty": [
          {
            "component": "...",
            "essential": true,
            "certainty": "HALLAZGO_RESPALDADO | HIPOTESIS | PENDIENTE_DE_VALIDAR",
            "evidence_ids": ["..."]
          }
        ],
        "certainty_resolution": "ALL_ESSENTIAL_SUPPORTED | DOWNGRADED_TO_HYPOTHESIS | SPLIT_REQUIRED | PENDING_VALIDATION",
        "certeza": "HALLAZGO_RESPALDADO | HIPOTESIS | PENDIENTE_DE_VALIDAR",
        "how_it_manifests": "...",
        "beneficio_contextual": "...",
        "costo_contextual": "...",
        "relevancia_empresarial": "...",
        "inference_limit": "...",
        "handoff_si_aplica": {
          "target_block": "...",
          "what_is_known": "...",
          "what_must_not_be_inferred": "...",
          "verification_needed": "...",
          "why_it_matters": "..."
        },
        "materiality_reason": "...",
        "future_kriterial_decision_impacted": "...",
        "report_eligible": true
      }
    ],
    "second_order_analysis": {
      "status": "SUPPORTED | HYPOTHESIS_ONLY | NO_MATERIAL_EVIDENCE",
      "candidate_pattern_ids": ["..."],
      "new_implication": "..."
    },
    "conditional_sections": {
      "tensions": {
        "status": "SUPPORTED | HYPOTHESIS_ONLY | NO_MATERIAL_EVIDENCE",
        "pattern_ids": ["..."]
      },
      "blind_spot": {
        "status": "SUPPORTED | HYPOTHESIS_ONLY | NO_MATERIAL_EVIDENCE",
        "pattern_ids": ["..."]
      },
      "history_roles": {
        "status": "SUPPORTED | HYPOTHESIS_ONLY | NO_MATERIAL_EVIDENCE",
        "pattern_ids": ["..."]
      }
    },
    "global_handoffs": [
      {
        "target_block": "...",
        "what_is_known": "...",
        "what_must_not_be_inferred": "...",
        "verification_needed": "...",
        "why_it_matters": "..."
      }
    ]
  }
}
