from forge.db.models.backup import Backup, BackupType, BackupStorageType, BackupStatus
from forge.db.models.backup_schedule import BackupSchedule, ScheduleFrequency, ScheduleStatus


def test_backup_model_uses_enum_values_for_persistence():
    backup_type_column = Backup.__table__.c.backup_type.type
    storage_type_column = Backup.__table__.c.storage_type.type
    status_column = Backup.__table__.c.status.type

    assert backup_type_column.enums == [member.value for member in BackupType]
    assert storage_type_column.enums == [member.value for member in BackupStorageType]
    assert status_column.enums == [member.value for member in BackupStatus]

    assert backup_type_column.name == "backuptype"
    assert storage_type_column.name == "backupstoragetype"
    assert status_column.name == "backupstatus"


def test_schedule_model_uses_enum_values_for_persistence():
    frequency_column = BackupSchedule.__table__.c.frequency.type
    backup_type_column = BackupSchedule.__table__.c.backup_type.type
    storage_type_column = BackupSchedule.__table__.c.storage_type.type
    status_column = BackupSchedule.__table__.c.status.type

    assert frequency_column.enums == [member.value for member in ScheduleFrequency]
    assert backup_type_column.enums == [member.value for member in BackupType]
    assert storage_type_column.enums == [member.value for member in BackupStorageType]
    assert status_column.enums == [member.value for member in ScheduleStatus]

    assert frequency_column.name == "schedulefrequency"
    assert backup_type_column.name == "backuptype"
    assert storage_type_column.name == "backupstoragetype"
    assert status_column.name == "schedulestatus"


def test_backup_status_backward_compatibility_alias():
    assert BackupStatus.IN_PROGRESS is BackupStatus.RUNNING
    assert BackupStatus.IN_PROGRESS.value == "running"
