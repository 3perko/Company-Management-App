"""Deleting, deactivating and undoing must not leave dangling references or stale derived state."""
import importlib.util
import io
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import text

from app.models import BillingStatement, Document
from tests.conftest import create
from tests.test_documents import EKASA_RECEIPT, RID, qr_png
from tests.test_finance import CAMT, _invoice

PERIOD = {"date_from": "2026-11-01", "date_to": "2026-11-30"}
STATEMENT_FILE = {"file": ("vypis.xml", CAMT.encode(), "application/xml")}


# ----------------------------------------------------------------------------- helpers
def _scan(color="white"):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (200, 300), color).save(buf, format="JPEG")
    return ("sken.jpg", buf.getvalue(), "image/jpeg")


def _file_rows(admin):
    rows = admin.get("/api/data/source_files", params={"columns": "status,document_id,error"}).json()["rows"]
    return {r["id"]: r for r in rows}


def _tx_rows(admin):
    cols = "counterparty_name,message,status,matched_amount,matched_docs,rule"
    rows = admin.get("/api/data/bank_transactions", params={"columns": cols}).json()["rows"]
    return {r["counterparty_name"] or r["message"]: r for r in rows}


def _bank(admin):
    """Bank account + received invoice + imported statement: the invoice is paid by the first transaction."""
    create(admin, "bank_accounts", {"iban": "SK31 1200 0000 1987 4263 7541"})
    inv = _invoice(admin)
    r = admin.post("/api/bank/import", files=STATEMENT_FILE)
    assert r.status_code == 200, r.text
    assert _tx_rows(admin)["Hagard s.r.o."]["status"] == "matched"
    assert admin.get(f"/api/documents/{inv}/full").json()["payment_status"] == "paid"
    return inv, r.json()["statement_id"]


def _billing(admin):
    """Project with one billable timesheet (200), one confirmed receipt (100 + 10 %) and one trip (22 km × 0.5)."""
    p = create(admin, "projects", {"name": "Sikorky", "bill_transport": True, "transport_rate_per_km": 0.5,
                                   "material_markup_pct": 10, "default_km_one_way": 10})
    w = create(admin, "workers", {"name": "Jano"})
    create(admin, "worker_rates", {"worker_id": w["id"], "cost_rate": 15, "billing_rate": 25})
    ts = create(admin, "timesheets", {"worker_id": w["id"], "project_id": p["id"], "date": "2026-11-02", "hours": 8})
    v = create(admin, "vehicles", {"name": "Auto", "initial_rate_per_km": 0.3})
    trip = create(admin, "trips", {"vehicle_id": v["id"], "project_id": p["id"], "date": "2026-11-02"})
    doc = admin.post("/api/documents/manual", json={"doc_type": "receipt"}).json()
    admin.put(f"/api/documents/{doc['id']}/full", json={"header": {"issue_date": "2026-11-02", "total_net": 100,
                                                                   "total_vat": 23, "total_gross": 123}})
    admin.post("/api/data/documents/actions/set_project", json={"ids": [doc["id"]], "payload": {"project_id": p["id"]}})
    assert admin.post(f"/api/documents/{doc['id']}/confirm").status_code == 200
    body = {"project_id": p["id"], **PERIOD}
    return {"project": p["id"], "worker": w["id"], "vehicle": v["id"], "timesheet": ts["id"], "trip": trip["id"],
            "doc": doc["id"], "body": body}


def _draft(admin, s):
    r = admin.post("/api/billing", json=s["body"])
    assert r.status_code == 200, r.text
    st = r.json()
    assert st["total_net"] == 321.0 and len(st["lines"]) == 3
    return st["id"]


def _statement(admin, st_id):
    return admin.get(f"/api/billing/{st_id}").json()


def _types(st):
    return sorted(ln["line_type"] for ln in st["lines"])


# ----------------------------------------------------------------------------- documents × bank
def test_delete_document_resets_bank_transaction(admin):
    inv, _ = _bank(admin)
    tx = _tx_rows(admin)["Hagard s.r.o."]
    assert tx["matched_amount"] == 123.0
    assert admin.delete(f"/api/data/documents/{inv}").status_code == 200
    # the transaction must not stay "matched" to a document that no longer exists
    tx = _tx_rows(admin)["Hagard s.r.o."]
    assert tx["status"] == "unmatched" and tx["matched_amount"] == 0 and tx["matched_docs"] is None
    assert admin.get(f"/api/bank/transactions/{tx['id']}").json()["matches"] == []
    missing = admin.get("/api/bank/missing").json()
    assert "Hagard s.r.o." in [t["counterparty"] for t in missing["transactions_without_document"]]
    assert missing["amount_mismatches"] == []
    # the same invoice entered again is paid by the same transaction
    inv2 = _invoice(admin)
    assert admin.post("/api/bank/match").status_code == 200
    assert _tx_rows(admin)["Hagard s.r.o."]["status"] == "matched"
    assert admin.get(f"/api/documents/{inv2}/full").json()["payment_status"] == "paid"


def test_delete_document_with_suggested_and_manual_matches(admin):
    _bank(admin)
    rec = admin.post("/api/documents/manual", json={"doc_type": "receipt"}).json()["id"]
    admin.put(f"/api/documents/{rec}/full", json={"header": {"partner_name": "OBI", "issue_date": "2026-11-06",
                                                             "total_gross": 45.9}})
    card = _tx_rows(admin)["OBI Bratislava platba kartou"]
    det = admin.post(f"/api/bank/transactions/{card['id']}/match", json={"document_id": rec}).json()
    assert det["status"] == "matched"
    assert admin.delete(f"/api/data/documents/{rec}").status_code == 200
    card = _tx_rows(admin)["OBI Bratislava platba kartou"]
    assert card["status"] == "unmatched" and card["matched_amount"] == 0


def test_unmatch_and_reset_refresh_document_payment(admin):
    inv, _ = _bank(admin)
    tx = _tx_rows(admin)["Hagard s.r.o."]
    match_id = admin.get(f"/api/bank/transactions/{tx['id']}").json()["matches"][0]["id"]
    assert admin.delete(f"/api/bank/matches/{match_id}").status_code == 200
    doc = admin.get(f"/api/documents/{inv}/full").json()
    assert doc["payment_status"] == "unpaid" and doc["paid_amount"] == 0 and doc["bank_matches"] == []
    assert _tx_rows(admin)["Hagard s.r.o."]["status"] == "unmatched"
    assert admin.delete(f"/api/bank/matches/{match_id}").status_code == 404
    admin.post(f"/api/bank/transactions/{tx['id']}/match", json={"document_id": inv})
    assert admin.get(f"/api/documents/{inv}/full").json()["payment_status"] == "paid"
    admin.post("/api/data/bank_transactions/actions/reset", json={"ids": [tx["id"]]})
    assert admin.get(f"/api/documents/{inv}/full").json()["payment_status"] == "unpaid"
    assert _tx_rows(admin)["Hagard s.r.o."]["matched_amount"] == 0


# ----------------------------------------------------------------------------- bank statements, rules
def test_delete_bank_statement_removes_transactions_and_allows_reimport(admin):
    inv, st = _bank(admin)
    assert admin.delete(f"/api/data/bank_statements/{st}").status_code == 200
    # its transactions are gone and the invoice is no longer paid by a transaction that does not exist
    assert admin.get("/api/data/bank_transactions").json()["total"] == 0
    doc = admin.get(f"/api/documents/{inv}/full").json()
    assert doc["payment_status"] == "unpaid" and doc["paid_amount"] == 0 and doc["bank_matches"] == []
    assert admin.get("/api/bank/missing").json()["transactions_without_document"] == []
    (sf,) = _file_rows(admin).values()
    assert sf["status"] == "skipped"
    # the very same statement file can be imported again
    r = admin.post("/api/bank/import", files=STATEMENT_FILE)
    assert r.status_code == 200 and not r.json().get("duplicate"), r.text
    assert admin.get("/api/data/bank_transactions").json()["total"] == 3
    assert admin.get("/api/data/bank_statements").json()["total"] == 1
    assert admin.get("/api/data/source_files").json()["total"] == 1
    assert admin.get(f"/api/documents/{inv}/full").json()["payment_status"] == "paid"
    assert admin.post("/api/bank/import", files=STATEMENT_FILE).json().get("duplicate") is True


def test_delete_bank_statement_then_reupload_through_inbox(admin):
    _, st = _bank(admin)
    assert admin.delete(f"/api/data/bank_statements/{st}").status_code == 200
    r = admin.post("/api/inbox/upload", data={"kind": "bank"},
                   files=[("files", STATEMENT_FILE["file"])]).json()
    assert r["stored"][0]["requeued"] is True and r["results"][0]["status"] == "processed", r
    assert admin.get("/api/data/bank_transactions").json()["total"] == 3


def test_delete_transaction_rule_keeps_transactions_readable(admin):
    create(admin, "bank_accounts", {"iban": "SK3112000000198742637541"})
    rule = create(admin, "transaction_rules", {"name": "Poplatky", "cond_text": "poplatok", "action": "no_document"})
    assert admin.post("/api/bank/import", files=STATEMENT_FILE).status_code == 200
    fee = _tx_rows(admin)["Poplatok za vedenie uctu"]
    assert fee["status"] == "no_document" and fee["rule"] == "Poplatky"
    assert admin.delete(f"/api/data/transaction_rules/{rule['id']}").status_code == 200
    fee = _tx_rows(admin)["Poplatok za vedenie uctu"]
    assert fee["status"] == "no_document" and fee["rule"] is None  # decision stays, the link is gone
    assert admin.get(f"/api/bank/transactions/{fee['id']}").status_code == 200
    admin.post("/api/data/bank_transactions/actions/reset", json={"ids": [fee["id"]]})
    assert _tx_rows(admin)["Poplatok za vedenie uctu"]["status"] == "unmatched"


# ----------------------------------------------------------------------------- billing statements
def test_delete_timesheet_and_trip_in_draft_statement(admin):
    s = _billing(admin)
    st = _draft(admin, s)
    assert admin.delete(f"/api/data/timesheets/{s['timesheet']}").status_code == 200
    d = _statement(admin, st)
    # the draft must not keep (and later invoice) hours that no longer exist
    assert _types(d) == ["material", "transport"]
    assert (d["total_net"], d["total_vat"], d["total_gross"]) == (121.0, 27.83, 148.83)
    assert admin.delete(f"/api/data/trips/{s['trip']}").status_code == 200
    d = _statement(admin, st)
    assert _types(d) == ["material"] and d["total_net"] == 110.0
    assert admin.post(f"/api/billing/{st}/close").status_code == 200
    assert admin.get(f"/api/documents/{s['doc']}/full").json()["allocations"][0]["billed"] is True


def test_delete_document_in_draft_statement(admin):
    s = _billing(admin)
    st = _draft(admin, s)
    assert admin.delete(f"/api/data/documents/{s['doc']}").status_code == 200
    d = _statement(admin, st)
    assert _types(d) == ["hours", "transport"] and d["total_net"] == 211.0


def test_resaving_document_keeps_billing_link(admin):
    s = _billing(admin)
    st = _draft(admin, s)
    alloc = admin.get(f"/api/documents/{s['doc']}/full").json()["allocations"][0]["id"]
    # the detail form always sends lines and allocations, even when only the note changed
    r = admin.put(f"/api/documents/{s['doc']}/full", json={
        "header": {"note": "poznámka"}, "lines": [],
        "allocations": [{"line_ref": None, "project_id": s["project"], "amount_gross": 123}]})
    assert r.status_code == 200, r.text
    assert [a["id"] for a in r.json()["allocations"]] == [alloc]
    assert _statement(admin, st)["total_net"] == 321.0
    assert admin.post(f"/api/billing/{st}/close").status_code == 200
    # the material is billed exactly once: flagged on the document and not offered again
    assert admin.get(f"/api/documents/{s['doc']}/full").json()["allocations"][0]["billed"] is True
    assert admin.post("/api/billing/preview", json=s["body"]).json()["lines"] == []


def test_reassigning_document_removes_it_from_draft_statement(admin):
    s = _billing(admin)
    st = _draft(admin, s)
    other = create(admin, "projects", {"name": "Lúky"})
    r = admin.post("/api/data/documents/actions/set_project",
                   json={"ids": [s["doc"]], "payload": {"project_id": other["id"]}})
    assert r.json()["ok"] == 1
    d = _statement(admin, st)
    assert _types(d) == ["hours", "transport"] and d["total_net"] == 211.0
    assert admin.post(f"/api/billing/{st}/close").status_code == 200
    assert admin.post("/api/billing/preview", json=s["body"]).json()["lines"] == []
    moved = admin.post("/api/billing/preview", json={"project_id": other["id"], **PERIOD}).json()
    assert [ln["line_type"] for ln in moved["lines"]] == ["material"]


def test_removing_document_line_removes_it_from_draft_statement(admin):
    p = create(admin, "projects", {"name": "Sikorky", "material_markup_pct": 0})
    doc = admin.post("/api/documents/manual", json={"doc_type": "receipt"}).json()["id"]
    full = admin.put(f"/api/documents/{doc}/full", json={
        "header": {"partner_name": "OBI", "issue_date": "2026-11-02", "total_gross": "24,60"},
        "lines": [{"description": "Páska", "quantity": 2, "vat_rate": 23, "total_gross": 6.15},
                  {"description": "Silikón", "quantity": 1, "vat_rate": 23, "total_gross": 18.45}]}).json()
    l1, l2 = full["lines"]
    allocs = [{"line_id": l1["id"], "project_id": p["id"], "amount_gross": 6.15},
              {"line_id": l2["id"], "project_id": p["id"], "amount_gross": 18.45}]
    r = admin.put(f"/api/documents/{doc}/full", json={"allocations": allocs, "confirm": True})
    assert r.status_code == 200, r.text
    kept = next(a["id"] for a in r.json()["allocations"] if a["line_id"] == l2["id"])
    st = admin.post("/api/billing", json={"project_id": p["id"], **PERIOD}).json()
    assert st["total_net"] == 20.0 and len(st["lines"]) == 2
    # drop the first line (and fix the total); the second line and its allocation stay as they are
    r = admin.put(f"/api/documents/{doc}/full", json={
        "header": {"total_gross": 18.45, "total_net": 15, "total_vat": 3.45},
        "lines": [l2], "allocations": allocs[1:]})
    assert r.status_code == 200, r.text
    assert [a["id"] for a in r.json()["allocations"]] == [kept]
    d = _statement(admin, st["id"])
    assert [ln["allocation_id"] for ln in d["lines"]] == [kept] and d["total_net"] == 15.0


def test_close_rejects_document_returned_to_review(admin):
    s = _billing(admin)
    st = _draft(admin, s)
    assert admin.post(f"/api/documents/{s['doc']}/unconfirm").json()["status"] == "review"
    r = admin.post(f"/api/billing/{st}/close")
    assert r.status_code == 409 and "nie je potvrdený" in r.json()["detail"]
    assert _statement(admin, st)["status"] == "draft"
    assert admin.post(f"/api/documents/{s['doc']}/confirm").status_code == 200
    assert admin.post(f"/api/billing/{st}/close").status_code == 200


def test_closed_statement_protects_its_items(admin):
    s = _billing(admin)
    st = _draft(admin, s)
    assert admin.post(f"/api/billing/{st}/close").status_code == 200
    for url in (f"/api/data/timesheets/{s['timesheet']}", f"/api/data/trips/{s['trip']}",
                f"/api/data/documents/{s['doc']}", f"/api/data/billing_statements/{st}"):
        r = admin.delete(url)
        assert r.status_code == 409, (url, r.text)
    # ... and not through bulk actions or by replacing the parent's children either
    other = create(admin, "projects", {"name": "Lúky"})
    for action, payload in (("set_project", {"project_id": other["id"]}), ("set_overhead", {}), ("unconfirm", {})):
        r = admin.post(f"/api/data/documents/actions/{action}", json={"ids": [s["doc"]], "payload": payload}).json()
        assert r["ok"] == 0 and len(r["failed"]) == 1, (action, r)
    r = admin.put(f"/api/documents/{s['doc']}/full", json={"allocations": []})
    assert r.status_code == 409
    r = admin.post("/api/data/timesheets/bulk-update", json={"ids": [s["timesheet"]], "values": {"hours": 1}}).json()
    assert r["ok"] == 0
    r = admin.patch(f"/api/billing/{st}", json={"remove_line_ids": [ln["id"] for ln in _statement(admin, st)["lines"]]})
    assert r.status_code == 409
    d = _statement(admin, st)
    assert d["status"] == "closed" and len(d["lines"]) == 3 and d["total_net"] == 321.0
    assert admin.get(f"/api/data/timesheets/{s['timesheet']}").json()["billed"] is True
    # reopening is the way to undo: flags are cleared, items can be changed and deleted again
    assert admin.post(f"/api/billing/{st}/reopen").status_code == 200
    assert admin.get(f"/api/data/timesheets/{s['timesheet']}").json()["billed"] is False
    assert admin.get(f"/api/documents/{s['doc']}/full").json()["allocations"][0]["billed"] is False
    assert admin.delete(f"/api/data/timesheets/{s['timesheet']}").status_code == 200
    assert _types(_statement(admin, st)) == ["material", "transport"]


def test_delete_draft_statement_frees_items(admin):
    s = _billing(admin)
    st = _draft(admin, s)
    assert admin.delete(f"/api/data/billing_statements/{st}").status_code == 200
    assert admin.get(f"/api/billing/{st}").status_code == 404
    assert admin.post("/api/billing/preview", json=s["body"]).json()["total_net"] == 321.0
    assert admin.patch(f"/api/data/timesheets/{s['timesheet']}", json={"hours": 9}).status_code == 200


def test_invoice_link_is_cleared_on_replace_and_delete(admin, db):
    s = _billing(admin)
    st = _draft(admin, s)
    a = _invoice(admin, number="P1", doc_type="invoice_out")
    b = _invoice(admin, number="P2", doc_type="invoice_out")
    assert admin.post(f"/api/billing/{st}/invoice", json={"document_id": a}).status_code == 200
    assert admin.post(f"/api/billing/{st}/invoice", json={"document_id": b}).status_code == 200
    db.expire_all()
    assert db.get(Document, a).billing_statement_id is None  # replaced invoice no longer points to the statement
    assert db.get(Document, b).billing_statement_id == st
    assert admin.post(f"/api/billing/{st}/close").status_code == 200
    assert admin.post(f"/api/billing/{st}/reopen").status_code == 409  # invoice linked
    # deleting the linked invoice clears the link, the statement can be reopened again
    assert admin.delete(f"/api/data/documents/{b}").status_code == 200
    d = _statement(admin, st)
    assert d["invoice_document_id"] is None and d["invoice"] is None
    assert admin.post(f"/api/billing/{st}/reopen").status_code == 200
    db.expire_all()
    assert db.get(BillingStatement, st).status == "draft"


# ----------------------------------------------------------------------------- files
def test_detach_file_releases_it_for_processing(admin):
    scan = _scan()
    a = admin.post("/api/documents/manual", json={"doc_type": "receipt"}).json()["id"]
    r = admin.post(f"/api/documents/{a}/files", files={"file": scan})
    fid = r.json()["files"][0]["id"]
    assert _file_rows(admin)[fid]["status"] == "processed"
    r = admin.delete(f"/api/documents/{a}/files/{fid}")
    assert r.status_code == 200 and r.json()["files"] == []
    # the file no longer belongs to any document -> it must not stay "processed" and pointing to it
    row = _file_rows(admin)[fid]
    assert row["status"] == "skipped" and row["document_id"] is None
    up = admin.post("/api/inbox/upload", data={"kind": "receipt"}, files=[("files", scan)]).json()
    assert up["stored"][0]["requeued"] is True and up["results"][0]["status"] == "processed", up
    assert up["results"][0]["document_id"] != a
    assert admin.get("/api/data/source_files").json()["total"] == 1


def test_detach_file_attached_to_two_documents(admin):
    scan = _scan()
    a = admin.post("/api/documents/manual", json={"doc_type": "receipt"}).json()["id"]
    b = admin.post("/api/documents/manual", json={"doc_type": "receipt"}).json()["id"]
    for d in (a, b):
        fid = admin.post(f"/api/documents/{d}/files", files={"file": scan}).json()["files"][0]["id"]
    assert _file_rows(admin)[fid]["document_id"] == b
    assert admin.delete(f"/api/documents/{b}/files/{fid}").status_code == 200
    row = _file_rows(admin)[fid]
    assert row["status"] == "processed" and row["document_id"] == a  # still attached to A
    up = admin.post("/api/inbox/upload", files=[("files", scan)]).json()
    assert up["results"] == [] and up["stored"][0]["requeued"] is False


def test_detach_primary_file_keeps_document_pointing_to_an_attached_file(admin):
    up = admin.post("/api/inbox/upload", data={"kind": "receipt"}, files=[("files", _scan())]).json()
    doc = up["results"][0]["document_id"]
    first = admin.get(f"/api/documents/{doc}/full").json()["source_file_id"]
    files = admin.post(f"/api/documents/{doc}/files",
                       files={"file": ("druhy.jpg", _scan("gray")[1], "image/jpeg")}).json()["files"]
    second = next(f["id"] for f in files if f["id"] != first)
    full = admin.delete(f"/api/documents/{doc}/files/{first}").json()
    assert [f["id"] for f in full["files"]] == [second] and full["source_file_id"] == second
    assert admin.get(f"/api/data/documents/{doc}").json()["file_name"] == "druhy.jpg"


def test_delete_source_file_keeps_document_and_allows_reupload(admin, monkeypatch):
    from app.services import ekasa
    monkeypatch.setattr(ekasa, "fetch_receipt", lambda rid, client=None: EKASA_RECEIPT)
    img = ("blocek.png", qr_png(RID), "image/png")
    up = admin.post("/api/inbox/upload", data={"kind": "receipt"}, files=[("files", img)]).json()
    doc = up["results"][0]["document_id"]
    fid = up["stored"][0]["id"]
    assert admin.delete(f"/api/data/source_files/{fid}").status_code == 200
    full = admin.get(f"/api/documents/{doc}/full").json()
    assert full["files"] == [] and full["source_file_id"] is None
    assert admin.get(f"/api/files/{fid}").status_code == 404
    # the same file again: stored as a new file and recognised as the existing receipt (same eKasa ID)
    up = admin.post("/api/inbox/upload", data={"kind": "receipt"}, files=[("files", img)]).json()
    assert up["stored"][0]["new"] is True and up["results"][0]["status"] == "duplicate", up
    assert admin.get("/api/data/documents").json()["total"] == 1
    assert len(admin.get(f"/api/documents/{doc}/full").json()["files"]) == 1


# ----------------------------------------------------------------------------- deactivation, master data
def test_deactivation_guards_cannot_be_bypassed_by_delete(admin):
    rows = admin.get("/api/data/projects", params={"columns": "name,is_overhead"}).json()["rows"]
    overhead = next(r["id"] for r in rows if r["is_overhead"])
    r = admin.delete(f"/api/data/projects/{overhead}")
    assert r.status_code == 422 and "Réžiu" in r.json()["detail"]
    assert admin.get(f"/api/data/projects/{overhead}").json()["active"] is True
    me = admin.get("/api/auth/me").json()["id"]
    r = admin.delete(f"/api/data/users/{me}")
    assert r.status_code == 422 and "deaktivovať" in r.json()["detail"]
    assert admin.get("/api/auth/me").status_code == 200
    # ordinary deactivation still works (and is never a hard delete)
    other = create(admin, "users", {"name": "Druhý", "email": "druhy@test.sk", "role": "admin", "password": "heslo1234"})
    assert admin.delete(f"/api/data/users/{other['id']}").status_code == 200
    rows = admin.get("/api/data/users", params={"include_inactive": True}).json()["rows"]
    assert {r["email"]: r["active"] for r in rows} == {"admin@test.sk": True, "druhy@test.sk": False}


def test_deactivated_master_data_keeps_records_readable(admin):
    s = _billing(admin)
    cust = create(admin, "customers", {"name": "Odberateľ"})
    admin.patch(f"/api/data/projects/{s['project']}", json={"customer_id": cust["id"]})
    for ent, key in (("workers", "worker"), ("vehicles", "vehicle"), ("projects", "project")):
        assert admin.delete(f"/api/data/{ent}/{s[key]}").status_code == 200
    assert admin.delete(f"/api/data/customers/{cust['id']}").status_code == 200
    t = admin.get(f"/api/data/timesheets/{s['timesheet']}").json()
    assert t["worker_id__label"] == "Jano" and t["project_id__label"] == "Sikorky" and t["cost_amount"] == 120.0
    assert admin.get(f"/api/data/trips/{s['trip']}").json()["cost_amount"] == 6.6
    rows = admin.get("/api/reports/project-costs", params={"include_inactive": True}).json()["rows"]
    assert next(r for r in rows if r["project_name"] == "Sikorky")["labor"] == 120.0
    # billing of the deactivated project still works
    st = admin.post("/api/billing", json=s["body"]).json()
    assert st["total_net"] == 321.0 and st["customer"]["name"] == "Odberateľ"
    ws = admin.get("/api/worker-statement", params={"worker_id": s["worker"], **PERIOD}).json()
    assert ws["total_hours"] == 8


def test_delete_rates_and_vehicle_records(admin):
    s = _billing(admin)
    soon = (date.today() + timedelta(days=300)).isoformat()
    ins = create(admin, "vehicle_insurance", {"vehicle_id": s["vehicle"], "insurer": "Allianz", "valid_to": soon,
                                              "document_id": s["doc"]})
    vig = create(admin, "vehicle_vignettes", {"vehicle_id": s["vehicle"], "valid_to": soon})
    svc = create(admin, "vehicle_services", {"vehicle_id": s["vehicle"], "date": "2026-11-02", "document_id": s["doc"]})
    chk = create(admin, "vehicle_checks", {"vehicle_id": s["vehicle"], "service": "pzp", "result": "valid"})
    kinds = lambda: {a["kind"] for a in admin.get("/api/fleet/alerts").json()}  # noqa: E731
    assert not {"pzp", "vignette"} & kinds()
    # deleting the document only clears the link on fleet records
    assert admin.delete(f"/api/data/documents/{s['doc']}").status_code == 200
    assert admin.get(f"/api/data/vehicle_insurance/{ins['id']}").json()["document_id"] is None
    assert admin.get(f"/api/data/vehicle_services/{svc['id']}").json()["document_id"] is None
    for ent, row in (("vehicle_insurance", ins), ("vehicle_vignettes", vig), ("vehicle_services", svc),
                     ("vehicle_checks", chk)):
        assert admin.delete(f"/api/data/{ent}/{row['id']}").status_code == 200
        assert admin.get(f"/api/data/{ent}").json()["total"] == 0
    assert {"pzp", "vignette"} <= kinds()  # alerts are computed from what is left
    # rates are snapshotted on timesheets / trips: deleting a rate does not change existing records
    for ent in ("worker_rates", "vehicle_rates"):
        rate = admin.get(f"/api/data/{ent}").json()["rows"][0]
        assert admin.delete(f"/api/data/{ent}/{rate['id']}").status_code == 200
    assert admin.get(f"/api/data/timesheets/{s['timesheet']}").json()["cost_amount"] == 120.0
    assert admin.get(f"/api/data/trips/{s['trip']}").json()["cost_amount"] == 6.6
    assert admin.get(f"/api/data/vehicles/{s['vehicle']}").json()["current_rate"] is None


def test_delete_saved_view(admin):
    v = admin.post("/api/views", json={"entity": "timesheets", "name": "Moje", "config": {"columns": ["date"]},
                                       "is_default": True}).json()
    admin.put("/api/views/last/timesheets", json={"config": {"sort": "date:asc"}})
    assert admin.delete(f"/api/views/{v['id']}").status_code == 200
    res = admin.get("/api/views", params={"entity": "timesheets"}).json()
    assert res["views"] == [] and res["last"]["config"]["sort"] == "date:asc"
    assert admin.delete(f"/api/views/{v['id']}").status_code == 404
    assert admin.patch(f"/api/views/{v['id']}", json={"name": "x"}).status_code == 404


def test_non_deletable_entities_answer_cleanly(admin):
    _bank(admin)
    tx = _tx_rows(admin)["Hagard s.r.o."]
    assert admin.delete(f"/api/data/bank_transactions/{tx['id']}").status_code == 400
    assert admin.delete("/api/data/audit_log/1").status_code == 403
    assert admin.delete("/api/data/allocations/1").status_code == 403
    assert admin.delete("/api/data/timesheets/999999").status_code == 404
    assert _tx_rows(admin)["Hagard s.r.o."]["status"] == "matched"


# ----------------------------------------------------------------------------- repair of older data
def _repair_statements():
    path = next((Path(__file__).resolve().parent.parent / "alembic" / "versions").glob("*_repair_state_after_deletes.py"))
    spec = importlib.util.spec_from_file_location("repair_migration", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.down_revision == "b2f4c7d19e30"
    return mod.STATEMENTS


def test_repair_migration_fixes_state_left_by_older_deletes(admin, db):
    inv, st_bank = _bank(admin)
    s = _billing(admin)
    st = _draft(admin, s)
    scan = _scan()
    other = admin.post("/api/documents/manual", json={"doc_type": "receipt"}).json()["id"]
    fid = admin.post(f"/api/documents/{other}/files", files={"file": scan}).json()["files"][0]["id"]
    # reproduce what the old code left behind (plain SQL deletes = only the database rules apply)
    for sql in (f"DELETE FROM document WHERE id = {inv}",  # matched invoice
                f"DELETE FROM timesheet_entry WHERE id = {s['timesheet']}",  # item of a draft statement
                f"DELETE FROM bank_statement WHERE id = {st_bank}",  # imported statement
                f"DELETE FROM document_source WHERE source_file_id = {fid}"):  # detached file
        db.execute(text(sql))
    db.commit()
    assert _tx_rows(admin)["Hagard s.r.o."]["status"] == "matched"
    assert _statement(admin, st)["total_net"] == 321.0
    files = _file_rows(admin)
    assert {f["status"] for f in files.values()} == {"processed"}

    for sql in _repair_statements():
        db.execute(text(sql))
    db.commit()

    tx = _tx_rows(admin)["Hagard s.r.o."]
    assert tx["status"] == "unmatched" and tx["matched_amount"] == 0
    assert _tx_rows(admin)["Poplatok za vedenie uctu"]["status"] == "unmatched"  # untouched
    d = _statement(admin, st)
    assert _types(d) == ["material", "transport"]
    assert (d["total_net"], d["total_vat"], d["total_gross"]) == (121.0, 27.83, 148.83)
    files = _file_rows(admin)
    assert files[fid]["status"] == "skipped" and files[fid]["document_id"] is None
    bank_file = next(f for i, f in files.items() if i != fid)
    assert bank_file["status"] == "skipped"
    # the statement can be imported again; it takes over the transactions left without a statement
    r = admin.post("/api/bank/import", files=STATEMENT_FILE)
    assert r.status_code == 200 and not r.json().get("duplicate"), r.text
    assert admin.get("/api/data/bank_transactions").json()["total"] == 3
    assert admin.delete(f"/api/data/bank_statements/{r.json()['statement_id']}").status_code == 200
    assert admin.get("/api/data/bank_transactions").json()["total"] == 0
    # running the repair again changes nothing
    for sql in _repair_statements():
        db.execute(text(sql))
    db.commit()
    assert _statement(admin, st)["total_net"] == 121.0

