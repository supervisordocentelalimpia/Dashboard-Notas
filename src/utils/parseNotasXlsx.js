// src/utils/parseNotasXlsx.js
import * as XLSX from "xlsx";

function norm(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.]/g, "");
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function cleanTime(s) {
  // "8_30 AM" -> "8:30 AM"
  return String(s ?? "").replace(/_/g, ":").trim();
}

export function parseCourseMetaFromFilename(filename) {
  const base = filename.replace(/\.(xlsx|xls)$/i, "");
  const parts = base.split(" - ").map((p) => p.trim());

  const meta = {
    period: parts[0] || "",
    program: parts[1] || "",
    levelRaw: parts.find((p) => /level/i.test(p)) || "",
    level: "",
    modality: parts[3] || "",
    start: "",
    end: "",
    schedule: "",
    teacher: "",
    room: "",
    courseId: "",
    fileBase: base,
    fileName: filename,
  };

  // Nivel: "LEVEL 2" -> "L02"
  const mLevel = meta.levelRaw.match(/(\d{1,2})/);
  if (mLevel) meta.level = `L${String(mLevel[1]).padStart(2, "0")}`;

  const teacherPart = parts.find((p) => /^teacher/i.test(p));
  if (teacherPart) meta.teacher = teacherPart.replace(/^teacher\s*/i, "").trim();

  const roomPart = parts.find((p) => /^room/i.test(p));
  if (roomPart) meta.room = roomPart.replace(/^room\s*/i, "").trim();

  const idPart = parts.find((p) => /^id/i.test(p));
  if (idPart) meta.courseId = idPart.replace(/^id\s*/i, "").trim();

  // Horario: usualmente hay 2 partes tipo "8_30 AM" y "10_00 AM"
  const times = parts.filter((p) => /\d+_\d+\s*(am|pm)/i.test(p));
  if (times.length >= 2) {
    meta.start = cleanTime(times[0]);
    meta.end = cleanTime(times[1]);
    meta.schedule = `${meta.start} - ${meta.end}`;
  }

  return meta;
}

function findHeaderRow(rows) {
  // Buscamos una fila que tenga "ID" y "Lastname" y algo de "Final"
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].map(norm);
    const hasId = r.includes("id");
    const hasLast = r.includes("lastname");
    const hasFinal = r.some((x) => x.includes("final"));
    if (hasId && hasLast && hasFinal) return i;
  }
  return -1;
}

function getColIndex(headerNorm, candidates) {
  // candidates: ["final grade", "finalgrade", ...]
  for (const c of candidates) {
    const idx = headerNorm.findIndex((h) => h === c || h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

function splitPhoneFromName(name) {
  // Caso raro: "NOMBRE - 58412..." -> separa el teléfono
  const s = String(name ?? "").trim();
  const m = s.match(/^(.*?)[\s\-–]+(58\d{9,12})$/);
  if (!m) return { name: s, phone: "" };
  return { name: m[1].trim(), phone: m[2].trim() };
}

export async function parseNotasFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => /\.(xlsx|xls)$/i.test(f.name));
  const warnings = [];
  const courses = [];
  const students = [];

  for (const file of files) {
    const meta = parseCourseMetaFromFilename(file.name);

    let wb;
    try {
      const data = await file.arrayBuffer();
      wb = XLSX.read(data, { type: "array" });
    } catch (e) {
      warnings.push(`No pude leer "${file.name}" como Excel.`);
      continue;
    }

    const sheetName = wb.SheetNames?.[0];
    const sheet = wb.Sheets?.[sheetName];
    if (!sheet) {
      warnings.push(`"${file.name}" no tiene hojas.`);
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const headerRowIdx = findHeaderRow(rows);

    if (headerRowIdx < 0) {
      warnings.push(`No encontré encabezados en "${file.name}". (Debe tener columnas como ID / Lastname / Final Grade).`);
      continue;
    }

    const header = rows[headerRowIdx];
    const headerNorm = header.map(norm);

    const idxId = getColIndex(headerNorm, ["id"]);
    const idxLast = getColIndex(headerNorm, ["lastname"]);
    const idxName = getColIndex(headerNorm, ["name"]);
    const idxAbs = getColIndex(headerNorm, ["abscence", "absence"]);
    const idxPerf = getColIndex(headerNorm, ["performance"]);
    const idxOral = getColIndex(headerNorm, ["oral"]);
    const idxWritten = getColIndex(headerNorm, ["written"]);
    const idxEstado = getColIndex(headerNorm, ["estado", "status"]);
    const idxFinal = getColIndex(headerNorm, ["final grade", "final"]);
    const idxEnroll = getColIndex(headerNorm, ["estado de inscripción", "inscripción", "inscripcion"]);

    const courseStudents = [];

    let started = false;
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const rawId = r[idxId];
      const idNum = toNum(rawId);

      if (!idNum) {
        if (started) break; // ya empezó la lista, entonces terminó
        continue;
      }
      started = true;

      const last = String(r[idxLast] ?? "").trim();
      const nm = String(r[idxName] ?? "").trim();
      const { name: nameFixed, phone } = splitPhoneFromName(nm);

      const estadoRaw = String(r[idxEstado] ?? "").trim();
      const estadoN = norm(estadoRaw);

      let resultado = "OTRO";
      if (estadoN === "passed") resultado = "APROBADO";
      else if (estadoN === "failed") resultado = "APLAZADO";

      const st = {
        sourceFile: file.name,
        period: meta.period,
        program: meta.program,
        level: meta.level || meta.levelRaw || "N/A",
        modality: meta.modality,
        schedule: meta.schedule || "N/A",
        teacher: meta.teacher || "N/A",
        room: meta.room || "",
        courseId: meta.courseId || "",
        studentId: String(Math.trunc(idNum)),
        lastname: last,
        name: nameFixed,
        phone, // por si viene pegado (raro)
        absences: toNum(r[idxAbs]),
        performance: toNum(r[idxPerf]),
        oral: toNum(r[idxOral]),
        written: toNum(r[idxWritten]),
        estadoRaw,
        resultado,
        finalGrade: toNum(r[idxFinal]),
        enrollmentStatus: String(r[idxEnroll] ?? "").trim(),
      };

      students.push(st);
      courseStudents.push(st);
    }

    const total = courseStudents.length;
    const aprobados = courseStudents.filter((s) => s.resultado === "APROBADO").length;
    const aplazados = courseStudents.filter((s) => s.resultado === "APLAZADO").length;

    const grades = courseStudents.map((s) => s.finalGrade).filter((g) => typeof g === "number");
    const avg = grades.length ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10 : null;

    const failPct = total ? Math.round((aplazados / total) * 100) : 0;

    let riesgo = "OK";
    if (failPct >= 35) riesgo = "RIESGO";
    else if (failPct >= 20) riesgo = "ALERTA";

    courses.push({
      ...meta,
      total,
      aprobados,
      aplazados,
      failPct,
      avg,
      riesgo,
    });
  }

  return { filesCount: files.length, courses, students, warnings };
}
