from dataclasses import dataclass
from typing import Literal


Role = Literal["patient", "staff", "clinician", "admin", "system"]
Visibility = Literal[
    "patient_approved",
    "patient_submitted",
    "staff_internal",
    "clinician_internal",
    "clinic_internal",
    "ai_internal",
    "admin_only",
]


class Forbidden(Exception):
    pass


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


@dataclass(frozen=True)
class User:
    id: str
    token: str
    role: Role
    clinic_id: str
    patient_id: str | None = None


@dataclass(frozen=True)
class Patient:
    id: str
    clinic_id: str
    display_name: str


@dataclass
class CareEntry:
    id: str
    clinic_id: str
    patient_id: str
    author_role: Role
    author_id: str | None
    entry_type: str
    visibility: Visibility
    content: str
    current_version: int = 1


@dataclass(frozen=True)
class Comment:
    id: str
    clinic_id: str
    patient_id: str
    entry_id: str
    visibility: Literal["internal", "patient_visible"]
    body: str


class CareNoteBoundary:
    def __init__(self) -> None:
        self.users = {
            "demo-patient": User("user-patient-jane", "demo-patient", "patient", "clinic-a", "patient-jane-tan"),
            "demo-staff": User("user-staff-a", "demo-staff", "staff", "clinic-a"),
            "demo-clinician": User("user-clinician-a", "demo-clinician", "clinician", "clinic-a"),
            "demo-admin": User("user-admin-a", "demo-admin", "admin", "clinic-a"),
            "demo-clinic-b-staff": User("user-staff-b", "demo-clinic-b-staff", "staff", "clinic-b"),
        }
        self.patients = {
            "patient-jane-tan": Patient("patient-jane-tan", "clinic-a", "Jane Tan"),
            "patient-clinic-b": Patient("patient-clinic-b", "clinic-b", "Alex Lim"),
        }
        self.entries = {
            "entry-clinician": CareEntry(
                "entry-clinician",
                "clinic-a",
                "patient-jane-tan",
                "clinician",
                "user-clinician-a",
                "clinician_note",
                "clinician_internal",
                "Penicillin allergy documented.",
            ),
            "entry-ai-nurse": CareEntry(
                "entry-ai-nurse",
                "clinic-a",
                "patient-jane-tan",
                "system",
                None,
                "ai_nurse_consult_summary",
                "ai_internal",
                "Patient reports no known drug allergies.",
            ),
            "entry-staff": CareEntry(
                "entry-staff",
                "clinic-a",
                "patient-jane-tan",
                "staff",
                "user-staff-a",
                "staff_note",
                "staff_internal",
                "Repeat renal panel has not yet been ordered.",
            ),
            "entry-approved": CareEntry(
                "entry-approved",
                "clinic-a",
                "patient-jane-tan",
                "clinician",
                "user-clinician-a",
                "instruction",
                "patient_approved",
                "Please attend the scheduled follow-up appointment.",
            ),
            "entry-clinic-b": CareEntry(
                "entry-clinic-b",
                "clinic-b",
                "patient-clinic-b",
                "staff",
                "user-staff-b",
                "staff_note",
                "staff_internal",
                "Synthetic Clinic B internal note.",
            ),
        }
        self.comments = {
            "comment-internal": Comment(
                "comment-internal",
                "clinic-a",
                "patient-jane-tan",
                "entry-staff",
                "internal",
                "Internal reminder for clinician review.",
            )
        }

    def authenticate(self, token: str) -> User:
        try:
            return self.users[token]
        except KeyError as exc:
            raise Forbidden("invalid token") from exc

    def list_patient_entries(self, token: str, patient_id: str) -> list[CareEntry]:
        user = self.authenticate(token)
        patient = self._patient_for_user(user, patient_id)
        return [entry for entry in self.entries.values() if entry.patient_id == patient.id and self._can_read_entry(user, entry)]

    def get_entry(self, token: str, entry_id: str) -> CareEntry:
        user = self.authenticate(token)
        entry = self.entries.get(entry_id)
        if entry is None:
            raise NotFound(entry_id)
        if not self._can_read_entry(user, entry):
            raise Forbidden(entry_id)
        return entry

    def list_comments(self, token: str, patient_id: str) -> list[Comment]:
        user = self.authenticate(token)
        patient = self._patient_for_user(user, patient_id)
        comments = [comment for comment in self.comments.values() if comment.patient_id == patient.id]
        if user.role == "patient":
            return [comment for comment in comments if comment.visibility == "patient_visible"]
        return comments

    def create_entry(self, token: str, patient_id: str, author_role: Role, content: str) -> CareEntry:
        user = self.authenticate(token)
        patient = self._patient_for_user(user, patient_id)
        if user.role == "staff" and author_role != "staff":
            raise Forbidden("staff may only create staff notes")
        if user.role == "clinician" and author_role != "clinician":
            raise Forbidden("clinician may only create clinician notes")
        if user.role == "patient":
            raise Forbidden("patients cannot create internal entries")
        entry = CareEntry(
            f"entry-created-{len(self.entries)}",
            patient.clinic_id,
            patient.id,
            author_role,
            user.id,
            f"{author_role}_note",
            "clinic_internal",
            content,
        )
        self.entries[entry.id] = entry
        return entry

    def edit_entry(self, token: str, entry_id: str, expected_version: int, content: str) -> CareEntry:
        user = self.authenticate(token)
        entry = self.entries.get(entry_id)
        if entry is None:
            raise NotFound(entry_id)
        if entry.clinic_id != user.clinic_id:
            raise Forbidden("cross-clinic edit")
        if user.role == "staff" and not (entry.author_role == "staff" and entry.author_id == user.id):
            raise Forbidden("staff cannot overwrite clinician notes")
        if user.role == "clinician" and not (entry.author_role == "clinician" and entry.author_id == user.id):
            raise Forbidden("clinician cannot overwrite staff notes")
        if user.role == "patient":
            raise Forbidden("patient cannot edit internal notes")
        if entry.current_version != expected_version:
            raise Conflict("stale version")
        entry.content = content
        entry.current_version += 1
        return entry

    def _patient_for_user(self, user: User, patient_id: str) -> Patient:
        patient = self.patients.get(patient_id)
        if patient is None:
            raise NotFound(patient_id)
        if user.role == "patient":
            if user.patient_id != patient.id:
                raise Forbidden("patient isolation")
        elif user.clinic_id != patient.clinic_id:
            raise Forbidden("clinic isolation")
        return patient

    def _can_read_entry(self, user: User, entry: CareEntry) -> bool:
        if entry.clinic_id != user.clinic_id:
            return False
        if user.role == "patient":
            return (
                user.patient_id == entry.patient_id
                and entry.visibility in {"patient_approved", "patient_submitted"}
                and not entry.entry_type.startswith("ai_")
            )
        if user.role in {"staff", "clinician"}:
            return entry.visibility != "admin_only"
        return user.role == "admin"
