export interface EvidenceFile { id: number; filename: string; size: number; sha256: string; media_type: string; }
export interface RoomSummary { id: number; title: string; purpose: string; status: string; discoverable: boolean; own: boolean; can_manage: boolean; access: string; }
export interface RoomEvidence { id: number; title: string; doc_type: string; license: string; content_note: string | null; is_demo: boolean; files: EvidenceFile[]; }
export interface RoomQuestion { id: number; question: string; answer: string | null; created_at: string; }
export interface RoomDetail extends RoomSummary { project_id: number | null; evidence: RoomEvidence[]; questions: RoomQuestion[]; }
export interface AccessRequest { id: number; user_name: string; organization: string; reason: string; status: string; decision_reason: string | null; }
export interface Invitation { id: number; email: string; role: string; status: string; expires_at: string; }
export interface RoomAudit { id: number; action: string; user_id: number; created_at: string; }
export interface NexusResource { id: number; project_id: number; domain: string; name: string; kind: string; quantity: string; unit: string; source: string; provenance: string; is_demo: boolean; }
