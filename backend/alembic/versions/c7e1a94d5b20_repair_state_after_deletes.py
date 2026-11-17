"""repair state left behind by deletes

Older versions left stale state when records were deleted:
- bank transactions stayed "matched" / "suggested" (with a matched amount) after their document was deleted,
- draft billing statements kept lines (and totals) of deleted timesheets / trips / allocations,
- files detached from a document stayed "processed" and pointing to it, so they could not be processed again,
- the file of a deleted bank statement stayed "processed", so the statement could not be imported again.

The application now handles all of these at delete time; this migration brings existing rows to the same state.

Revision ID: c7e1a94d5b20
Revises: b2f4c7d19e30
Create Date: 2026-11-17 12:30:00

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c7e1a94d5b20'
down_revision: Union[str, Sequence[str], None] = 'b2f4c7d19e30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TX_STATUS = "CASE WHEN s.confirmed > 0 THEN 'matched' WHEN s.n > 0 THEN 'suggested' ELSE 'unmatched' END"
# a line created from a source record whose link was cleared by ON DELETE SET NULL
ORPHAN_LINE = """l.line_type IN ('hours', 'material', 'transport')
    AND l.timesheet_id IS NULL AND l.allocation_id IS NULL AND l.trip_id IS NULL"""
VAT = "CASE WHEN c.vat_payer THEN round(n.net * s.vat_rate / 100, 2) ELSE 0 END"
FILE_OF_DOCUMENT = "sf.status IN ('processed', 'duplicate') AND sf.document_id IS NOT NULL"

STATEMENTS = [
    # 1. bank transactions: status and matched amount follow the matches that still exist
    f"""
    UPDATE bank_transaction t
    SET matched_amount = s.confirmed, status = {TX_STATUS}
    FROM (SELECT bt.id, COALESCE(sum(m.amount) FILTER (WHERE m.confirmed), 0) AS confirmed, count(m.id) AS n
          FROM bank_transaction bt LEFT JOIN transaction_match m ON m.transaction_id = bt.id
          WHERE bt.status IN ('matched', 'suggested') GROUP BY bt.id) s
    WHERE t.id = s.id AND (t.matched_amount <> s.confirmed OR t.status <> {TX_STATUS})
    """,
    # 2. draft billing statements: totals without the orphaned lines, then drop those lines
    f"""
    UPDATE billing_statement s
    SET total_net = n.net, total_vat = {VAT}, total_gross = n.net + {VAT}
    FROM company c,
         (SELECT l.statement_id, COALESCE(sum(l.amount) FILTER (WHERE NOT ({ORPHAN_LINE})), 0) AS net
          FROM billing_statement_line l GROUP BY l.statement_id
          HAVING count(*) FILTER (WHERE {ORPHAN_LINE}) > 0) n
    WHERE s.id = n.statement_id AND s.status = 'draft' AND c.id = s.company_id
    """,
    f"""
    DELETE FROM billing_statement_line l USING billing_statement s
    WHERE s.id = l.statement_id AND s.status = 'draft' AND {ORPHAN_LINE}
    """,
    # 3. files detached from their document: point to another document they are attached to, or release them
    f"""
    UPDATE source_file sf
    SET document_id = (SELECT min(ds.document_id) FROM document_source ds WHERE ds.source_file_id = sf.id)
    WHERE {FILE_OF_DOCUMENT} AND EXISTS (SELECT 1 FROM document_source ds WHERE ds.source_file_id = sf.id)
      AND NOT EXISTS (SELECT 1 FROM document_source ds
                      WHERE ds.source_file_id = sf.id AND ds.document_id = sf.document_id)
    """,
    f"""
    UPDATE source_file sf
    SET document_id = NULL, status = 'skipped',
        error = 'Súbor bol odpojený od dokladu – dá sa spracovať znova.'
    WHERE {FILE_OF_DOCUMENT} AND NOT EXISTS (SELECT 1 FROM document_source ds WHERE ds.source_file_id = sf.id)
    """,
    # 4. files of deleted bank statements can be imported again (their transactions are taken over on import)
    """
    UPDATE source_file sf
    SET status = 'skipped', error = 'Výpis bol vymazaný – súbor sa dá importovať znova.'
    WHERE sf.status = 'processed' AND sf.document_id IS NULL
      AND (sf.kind_hint = 'bank' OR sf.error LIKE 'Bankový výpis%')
      AND NOT EXISTS (SELECT 1 FROM bank_statement bs WHERE bs.source_file_id = sf.id)
    """,
]


def upgrade() -> None:
    for sql in STATEMENTS:
        op.execute(sql)


def downgrade() -> None:
    # data repair only – nothing to undo
    pass
