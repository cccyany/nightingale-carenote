import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


class SupabaseUnavailable(RuntimeError):
    pass


def load_dotenv() -> None:
    path = Path(".env.local")
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def supabase_origin() -> str:
    raw_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    if not raw_url:
        raise SupabaseUnavailable("NEXT_PUBLIC_SUPABASE_URL is not configured")
    parsed = urlparse(raw_url)
    return f"{parsed.scheme}://{parsed.netloc}"


class SupabaseSession:
    def __init__(self, access_token: str, apikey: str) -> None:
        self.access_token = access_token
        self.apikey = apikey
        self.origin = supabase_origin()

    def get(self, table: str, params: dict[str, str]) -> tuple[int, object]:
        return self._request("GET", f"/rest/v1/{table}?{urlencode(params)}")

    def patch(self, table: str, params: dict[str, str], payload: dict[str, object]) -> tuple[int, object]:
        return self._request("PATCH", f"/rest/v1/{table}?{urlencode(params)}", payload)

    def delete(self, table: str, params: dict[str, str]) -> tuple[int, object]:
        return self._request("DELETE", f"/rest/v1/{table}?{urlencode(params)}")

    def rpc(self, name: str, payload: dict[str, object]) -> tuple[int, object]:
        return self._request("POST", f"/rest/v1/rpc/{name}", payload)

    def postgrest_insert(self, table: str, payload: dict[str, object]) -> tuple[int, object]:
        return self._request("POST", f"/rest/v1/{table}", payload)

    def _request(self, method: str, path: str, payload: dict[str, object] | None = None) -> tuple[int, object]:
        body = None if payload is None else json.dumps(payload).encode()
        request = Request(
            f"{self.origin}{path}",
            data=body,
            method=method,
            headers={
                "apikey": self.apikey,
                "authorization": f"Bearer {self.access_token}",
                "content-type": "application/json",
                "prefer": "return=representation",
            },
        )
        try:
            with urlopen(request, timeout=20) as response:
                text = response.read().decode()
                return response.status, json.loads(text) if text else None
        except HTTPError as error:
            text = error.read().decode()
            try:
                parsed: object = json.loads(text)
            except json.JSONDecodeError:
                parsed = text
            return error.status, parsed


def sign_in(email: str, password: str = "demo-password") -> SupabaseSession:
    load_dotenv()
    anon_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not anon_key:
        raise SupabaseUnavailable("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured")

    request = Request(
        f"{supabase_origin()}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        method="POST",
        headers={"apikey": anon_key, "content-type": "application/json"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode())
    except HTTPError as error:
        raise AssertionError(f"Supabase Auth sign-in failed for {email}: {error.status}") from error

    return SupabaseSession(payload["access_token"], anon_key)


def service_session() -> SupabaseSession:
    load_dotenv()
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not service_key:
        raise SupabaseUnavailable("SUPABASE_SERVICE_ROLE_KEY is not configured")
    return SupabaseSession(service_key, service_key)


def admin_create_auth_user(user_id: str, email: str, password: str = "demo-password") -> None:
    load_dotenv()
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not service_key:
        raise SupabaseUnavailable("SUPABASE_SERVICE_ROLE_KEY is not configured")
    request = Request(
        f"{supabase_origin()}/auth/v1/admin/users",
        data=json.dumps({
            "id": user_id,
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"synthetic_demo": True, "generated_demo_identity": True},
        }).encode(),
        method="POST",
        headers={
            "apikey": service_key,
            "authorization": f"Bearer {service_key}",
            "content-type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=20):
            return
    except HTTPError as error:
        if error.status == 422:
            return
        raise


def admin_delete_auth_user(user_id: str) -> None:
    load_dotenv()
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not service_key:
        raise SupabaseUnavailable("SUPABASE_SERVICE_ROLE_KEY is not configured")
    request = Request(
        f"{supabase_origin()}/auth/v1/admin/users/{user_id}",
        method="DELETE",
        headers={
            "apikey": service_key,
            "authorization": f"Bearer {service_key}",
            "content-type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=20):
            return
    except HTTPError as error:
        if error.status == 404:
            return
        raise
