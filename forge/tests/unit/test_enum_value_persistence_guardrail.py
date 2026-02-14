from enum import Enum as PyEnum

from sqlalchemy import Enum as SAEnum

from forge.db.base import Base
import forge.db.models  # noqa: F401 - ensures model metadata is fully loaded


def test_all_python_enums_persist_values_not_names():
    mismatches: list[str] = []

    for table_name, table in Base.metadata.tables.items():
        for column in table.columns:
            if not isinstance(column.type, SAEnum):
                continue

            enum_cls = getattr(column.type, "enum_class", None)
            if enum_cls is None or not issubclass(enum_cls, PyEnum):
                continue

            expected = [member.value for member in enum_cls]
            actual = list(column.type.enums or [])

            if actual != expected:
                mismatches.append(
                    f"{table_name}.{column.name}: expected {expected}, got {actual}"
                )

    assert not mismatches, "\n".join(mismatches)
