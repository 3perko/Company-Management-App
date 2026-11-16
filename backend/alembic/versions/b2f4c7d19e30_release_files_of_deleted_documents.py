"""release source files of deleted documents

Files whose document was deleted stayed "processed" / "duplicate" with a dangling document_id, so the same
file could never be ingested again. Point them to another document they are attached to, or mark them
"skipped" so they can be uploaded / reprocessed again.

Revision ID: b2f4c7d19e30
Revises: 91a31aa31a88
Create Date: 2026-11-16 15:20:00

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b2f4c7d19e30'
down_revision: Union[str, Sequence[str], None] = '91a31aa31a88'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ORPHAN = """
    sf.status IN ('processed', 'duplicate') AND sf.document_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM document d WHERE d.id = sf.document_id)
"""


def upgrade() -> None:
    op.execute(f"""
        UPDATE source_file sf
        SET document_id = (SELECT min(ds.document_id) FROM document_source ds WHERE ds.source_file_id = sf.id)
        WHERE {ORPHAN} AND EXISTS (SELECT 1 FROM document_source ds WHERE ds.source_file_id = sf.id)
    """)
    op.execute(f"""
        UPDATE source_file sf
        SET document_id = NULL, status = 'skipped',
            error = 'Doklad bol vymazaný – súbor sa dá spracovať znova.'
        WHERE {ORPHAN}
    """)


def downgrade() -> None:
    # data repair only – nothing to undo
    pass
