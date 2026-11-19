import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Plus, UserCheck } from 'lucide-react';
import { Classroom, MasterDataStore } from '../types/eduplan';
import { formatTeacherHonorific, resolveActiveTeachingContext } from '../utils/masterDataDb';
import { SmartboardViewport } from './SmartboardViewport';

interface CreateClassroomFromMasterModalProps {
  open: boolean;
  onClose: () => void;
  masterData?: MasterDataStore;
  existingClasses: Classroom[];
  onCreateClass: (classroom: Classroom) => Promise<void> | void;
  onSelectExistingClass?: (classId: string) => void;
}

export const CreateClassroomFromMasterModal: React.FC<CreateClassroomFromMasterModalProps> = ({
  open,
  onClose,
  masterData,
  existingClasses,
  onCreateClass,
  onSelectExistingClass,
}) => {
  const ctx = useMemo(() => resolveActiveTeachingContext(masterData), [masterData]);

  const schoolYears = masterData?.schoolYears || [];
  const teachers = masterData?.teachers || [];
  const classCatalog = masterData?.classCatalog || [];
  const assignments = masterData?.assignments || [];

  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [grade, setGrade] = useState<'10' | '11' | '12'>('12');
  const [selectedClassName, setSelectedClassName] = useState<string>('');
  const [customClassName, setCustomClassName] = useState<string>('');
  const [useCustomClass, setUseCustomClass] = useState(false);
  const [homeroomTeacher, setHomeroomTeacher] = useState<string>(ctx.teacherHonorific);
  const [subjectTeacher, setSubjectTeacher] = useState<string>(ctx.teacherHonorific);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sync defaults when modal opens
  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    const defaultYearId =
      masterData?.profile.activeSchoolYearId ||
      schoolYears.find((y) => y.isCurrent)?.id ||
      schoolYears[0]?.id ||
      '';
    setSelectedYearId(defaultYearId);
    setGrade('12');
    setUseCustomClass(false);
    setCustomClassName('');
  }, [open, masterData?.profile.activeSchoolYearId, schoolYears]);

  // Catalog classes matching selected Year & Grade
  const catalogOptions = useMemo(() => {
    return classCatalog.filter(
      (c) => (!selectedYearId || c.schoolYearId === selectedYearId) && c.grade === grade
    );
  }, [classCatalog, selectedYearId, grade]);

  // Auto pick first non-created catalog class when Year/Grade changes
  useEffect(() => {
    if (!open) return;
    if (catalogOptions.length > 0) {
      const yearLabel =
        schoolYears.find((y) => y.id === selectedYearId)?.label || ctx.schoolYearLabel;
      const notYetCreated = catalogOptions.find(
        (cat) =>
          !existingClasses.some(
            (ex) =>
              ex.name.trim().toUpperCase() === cat.name.trim().toUpperCase() &&
              ex.schoolYear === yearLabel
          )
      );
      setSelectedClassName((notYetCreated || catalogOptions[0]).name);
      setUseCustomClass(false);
    } else {
      setSelectedClassName('');
      setUseCustomClass(true);
    }
  }, [open, selectedYearId, grade, catalogOptions, existingClasses, schoolYears, ctx.schoolYearLabel]);

  // Auto-fill GVCN & GVBM from Assignments table whenever selected class changes
  useEffect(() => {
    if (!open) return;
    const targetName = (useCustomClass ? customClassName : selectedClassName).trim().toUpperCase();
    const asg = assignments.find(
      (a) =>
        (!selectedYearId || a.schoolYearId === selectedYearId) &&
        a.className.trim().toUpperCase() === targetName
    );
    const gvcnRecord = asg ? teachers.find((t) => t.id === asg.homeroomTeacherId) : undefined;
    const gvbmId = asg?.subjectTeachers?.[ctx.subjectName];
    const gvbmRecord = gvbmId ? teachers.find((t) => t.id === gvbmId) : undefined;

    setHomeroomTeacher(
      gvcnRecord ? formatTeacherHonorific(gvcnRecord) : ctx.teacherHonorific
    );
    setSubjectTeacher(
      gvbmRecord ? formatTeacherHonorific(gvbmRecord) : ctx.teacherHonorific
    );
  }, [
    open,
    selectedYearId,
    selectedClassName,
    customClassName,
    useCustomClass,
    assignments,
    teachers,
    ctx.subjectName,
    ctx.teacherHonorific,
  ]);

  if (!open) return null;

  const selectedYearLabel =
    schoolYears.find((y) => y.id === selectedYearId)?.label || ctx.schoolYearLabel;
  const resolvedName = (useCustomClass ? customClassName : selectedClassName).trim().toUpperCase();

  const existingDuplicate = existingClasses.find(
    (c) =>
      c.name.trim().toUpperCase() === resolvedName &&
      c.schoolYear === selectedYearLabel
  );

  const teacherOptions = teachers.map((t) => ({
    id: t.id,
    label: formatTeacherHonorific(t),
    dept: t.departmentGroup,
  }));

  const handleSubmit = async () => {
    if (!resolvedName) {
      setErrorMsg('Vui lòng chọn hoặc nhập tên lớp học.');
      return;
    }
    if (existingDuplicate) {
      setErrorMsg(
        `Lớp ${existingDuplicate.name} (${existingDuplicate.schoolYear}) đã tồn tại trong danh sách lớp.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const newCls: Classroom = {
        id: `cls-${Date.now()}`,
        name: resolvedName,
        grade,
        schoolYear: selectedYearLabel,
        homeroomTeacher: homeroomTeacher.trim() || ctx.teacherHonorific,
        subjectTeacher: subjectTeacher.trim() || ctx.teacherHonorific,
        createdAt: new Date().toISOString(),
      };
      await onCreateClass(newCls);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SmartboardViewport
      isModal
      onCloseModal={onClose}
      maxWidthClass="max-w-lg"
      title={
        <div className="flex items-center gap-2">
          <BookOpenCheck className="h-4 w-4 text-[#136F63]" />
          <span>Mở lớp học mới từ Khai báo Đầu năm</span>
        </div>
      }
      subtitle={`${ctx.schoolName} · Tự động liên thông Năm học, GVCN & GVBM`}
      bodyClassName="p-5"
    >
      <div className="space-y-3.5 text-[13.5px] text-[#334155]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#64748B]">
                Năm học
              </label>
              {schoolYears.length > 0 ? (
                <select
                  value={selectedYearId}
                  onChange={(e) => setSelectedYearId(e.target.value)}
                  className="h-9 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-medium text-[#334155] outline-none focus:border-[#136F63]"
                >
                  {schoolYears.map((sy) => (
                    <option key={sy.id} value={sy.id}>
                      {sy.label} {sy.isCurrent ? '(Hiện hành)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={selectedYearLabel}
                  readOnly
                  className="h-9 w-full rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] px-3 text-[13.5px] text-[#334155]"
                />
              )}
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#64748B]">
                Khối lớp
              </label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value as '10' | '11' | '12')}
                className="h-9 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-medium text-[#334155] outline-none focus:border-[#136F63]"
              >
                <option value="12">Khối 12</option>
                <option value="11">Khối 11</option>
                <option value="10">Khối 10</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[12px] font-medium text-[#64748B]">
                Chọn lớp từ Danh mục Đầu năm *
              </label>
              {catalogOptions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setUseCustomClass((v) => !v)}
                  className="text-[12px] font-medium text-[#136F63] hover:underline"
                >
                  {useCustomClass ? 'Chọn từ danh mục có sẵn' : '+ Nhập tên lớp khác'}
                </button>
              )}
            </div>

            {!useCustomClass && catalogOptions.length > 0 ? (
              <select
                value={selectedClassName}
                onChange={(e) => {
                  setSelectedClassName(e.target.value);
                  setErrorMsg(null);
                }}
                className="h-9 w-full rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] px-3 text-[13.5px] font-semibold text-[#136F63] outline-none focus:border-[#136F63]"
              >
                {catalogOptions.map((cat) => {
                  const alreadyExists = existingClasses.some(
                    (ex) =>
                      ex.name.trim().toUpperCase() === cat.name.trim().toUpperCase() &&
                      ex.schoolYear === selectedYearLabel
                  );
                  return (
                    <option key={cat.id} value={cat.name}>
                      Lớp {cat.name} · Sĩ số DK {cat.plannedSize}
                      {cat.room ? ` · ${cat.room}` : ''}
                      {alreadyExists ? ' (Đã có trong sổ lớp)' : ''}
                    </option>
                  );
                })}
              </select>
            ) : (
              <input
                value={customClassName}
                onChange={(e) => {
                  setCustomClassName(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder={`Ví dụ: ${grade}A4, ${grade}B3...`}
                className="h-9 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-medium text-[#334155] outline-none focus:border-[#136F63]"
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1 text-[12px] font-medium text-[#64748B]">
                <UserCheck className="h-3.5 w-3.5 text-[#136F63]" />
                GV Chủ nhiệm (GVCN)
              </label>
              {teacherOptions.length > 0 ? (
                <select
                  value={homeroomTeacher}
                  onChange={(e) => setHomeroomTeacher(e.target.value)}
                  className="h-9 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] text-[#334155] outline-none focus:border-[#136F63]"
                >
                  {!teacherOptions.some((t) => t.label === homeroomTeacher) && homeroomTeacher && (
                    <option value={homeroomTeacher}>{homeroomTeacher}</option>
                  )}
                  {teacherOptions.map((t) => (
                    <option key={t.id} value={t.label}>
                      {t.label} ({t.dept})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={homeroomTeacher}
                  onChange={(e) => setHomeroomTeacher(e.target.value)}
                  className="h-9 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] text-[#334155]"
                />
              )}
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#64748B]">
                GV Bộ môn ({ctx.subjectName})
              </label>
              {teacherOptions.length > 0 ? (
                <select
                  value={subjectTeacher}
                  onChange={(e) => setSubjectTeacher(e.target.value)}
                  className="h-9 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] text-[#334155] outline-none focus:border-[#136F63]"
                >
                  {!teacherOptions.some((t) => t.label === subjectTeacher) && subjectTeacher && (
                    <option value={subjectTeacher}>{subjectTeacher}</option>
                  )}
                  {teacherOptions.map((t) => (
                    <option key={t.id} value={t.label}>
                      {t.label} ({t.dept})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={subjectTeacher}
                  onChange={(e) => setSubjectTeacher(e.target.value)}
                  className="h-9 w-full rounded-[8px] border border-[#CBD5E1] bg-white px-3 text-[13.5px] text-[#334155]"
                />
              )}
            </div>
          </div>

          {existingDuplicate && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#FEF3C7] bg-[#FEF3C7] px-3 py-2 text-[12px] text-[#B45309]">
              <span>
                Lớp <strong>{existingDuplicate.name}</strong> ({existingDuplicate.schoolYear}) đã được mở.
              </span>
              {onSelectExistingClass && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectExistingClass(existingDuplicate.id);
                    onClose();
                  }}
                  className="rounded-[8px] bg-[#136F63] px-2.5 py-1 text-[12px] font-medium text-white hover:bg-[#0F594F]"
                >
                  Chuyển tới lớp này
                </button>
              )}
            </div>
          )}

          {errorMsg && !existingDuplicate && (
            <div className="rounded-[8px] border border-[#FEE2E2] bg-[#FEE2E2] px-3 py-2 text-[12px] font-medium text-[#B91C1C]">
              {errorMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-glossy-3d-inactive min-h-[48px] rounded-[8px] px-4 py-2 text-[13.5px] font-medium"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={submitting || !resolvedName || Boolean(existingDuplicate)}
              onClick={handleSubmit}
              className="btn-glossy-3d-active inline-flex min-h-[48px] items-center gap-1.5 rounded-[8px] px-4 py-2 text-[13.5px] font-medium disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Mở lớp {resolvedName || ''}
            </button>
          </div>
      </div>
    </SmartboardViewport>
  );
};
