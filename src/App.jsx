// src/App.jsx
import React, { useMemo, useRef, useState } from "react";
import {
  Upload, FolderUp, Trash2, Download, Search, AlertTriangle, CheckCircle2, XCircle, BarChart3
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip
} from "recharts";
import * as XLSX from "xlsx";
import { parseNotasFiles } from "./utils/parseNotasXlsx";

export default function App() {
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);

  // filtros
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("All");
  const [teacher, setTeacher] = useState("All");
  const [result, setResult] = useState("All");

  const reset = () => {
    setWarnings([]);
    setCourses([]);
    setStudents([]);
    setQ("");
    setLevel("All");
    setTeacher("All");
    setResult("All");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const handleFiles = async (files) => {
    setWarnings([]);
    setLoading(true);
    try {
      const res = await parseNotasFiles(files);
      setWarnings(res.warnings || []);
      setCourses(res.courses || []);
      setStudents(res.students || []);
    } finally {
      setLoading(false);
    }
  };

  const levelOptions = useMemo(() => {
    const ls = Array.from(new Set(students.map((s) => s.level).filter(Boolean))).sort();
    return ["All", ...ls];
  }, [students]);

  const teacherOptions = useMemo(() => {
    const ts = Array.from(new Set(students.map((s) => s.teacher).filter(Boolean))).sort();
    return ["All", ...ts];
  }, [students]);

  const filteredStudents = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return students.filter((s) => {
      const matchQ =
        !qq ||
        (s.name || "").toLowerCase().includes(qq) ||
        (s.lastname || "").toLowerCase().includes(qq) ||
        (s.studentId || "").includes(qq) ||
        (s.courseId || "").includes(qq);

      const matchLevel = level === "All" || s.level === level;
      const matchTeacher = teacher === "All" || s.teacher === teacher;
      const matchResult = result === "All" || s.resultado === result;

      return matchQ && matchLevel && matchTeacher && matchResult;
    });
  }, [students, q, level, teacher, result]);

  const kpis = useMemo(() => {
    const total = students.length;
    const aprobados = students.filter((s) => s.resultado === "APROBADO").length;
    const aplazados = students.filter((s) => s.resultado === "APLAZADO").length;
    const tasaAprob = total ? Math.round((aprobados / total) * 100) : 0;

    const grades = students.map((s) => s.finalGrade).filter((g) => typeof g === "number");
    const promedio = grades.length ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10 : null;

    const cursosRiesgo = courses.filter((c) => c.riesgo === "RIESGO").length;
    const cursosAlerta = courses.filter((c) => c.riesgo === "ALERTA").length;

    return { total, aprobados, aplazados, tasaAprob, promedio, cursosRiesgo, cursosAlerta };
  }, [students, courses]);

  const chartByLevel = useMemo(() => {
    const map = new Map();
    for (const s of students) {
      const key = s.level || "N/A";
      if (!map.has(key)) map.set(key, { level: key, aprobados: 0, aplazados: 0, total: 0 });
      const obj = map.get(key);
      obj.total += 1;
      if (s.resultado === "APROBADO") obj.aprobados += 1;
      if (s.resultado === "APLAZADO") obj.aplazados += 1;
    }
    return Array.from(map.values()).sort((a, b) => a.level.localeCompare(b.level));
  }, [students]);

  const exportExcel = () => {
    if (!filteredStudents.length) return;

    const rows = filteredStudents.map((s) => ({
      Periodo: s.period,
      Programa: s.program,
      Nivel: s.level,
      Modalidad: s.modality,
      Horario: s.schedule,
      Profesor: s.teacher,
      CursoID: s.courseId,
      Cedula: s.studentId,
      Apellido: s.lastname,
      Nombre: s.name,
      Resultado: s.resultado,
      NotaFinal: s.finalGrade ?? "",
      Inasistencias: s.absences ?? "",
      EstadoInscripcion: s.enrollmentStatus ?? "",
      TelefonoDetectado: s.phone || "",
      Archivo: s.sourceFile,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notas");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `dashboard_notas_${today}.xlsx`);
  };

  const hasData = students.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl md:text-2xl font-bold">Dashboard de Notas</h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            <input
              ref={folderInputRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              // Folder upload (Chrome/Edge)
              webkitdirectory="true"
              directory="true"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
            >
              <Upload className="h-4 w-4" />
              Cargar archivos
            </button>

            <button
              onClick={() => folderInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50"
              title="Funciona mejor en Chrome/Edge"
            >
              <FolderUp className="h-4 w-4" />
              Cargar carpeta
            </button>

            <button
              onClick={exportExcel}
              disabled={!filteredStudents.length}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Exportar Excel
            </button>

            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50"
            >
              <Trash2 className="h-4 w-4" />
              Limpiar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {loading && (
          <div className="mb-4 p-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm">
            Procesando Excel... (todo ocurre en tu navegador, no se sube nada)
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mb-4 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
            <div className="font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Avisos
            </div>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {!hasData ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <h2 className="text-lg font-bold mb-2">Carga tus Excel para empezar</h2>
            <p className="text-slate-600 text-sm">
              Puedes seleccionar múltiples archivos, o una carpeta completa (Chrome/Edge).
            </p>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-sm text-slate-500">Estudiantes</div>
                <div className="text-3xl font-bold">{kpis.total}</div>
                <div className="text-xs text-slate-500 mt-1">Total cargados</div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-sm text-slate-500">Aprobación</div>
                <div className="text-3xl font-bold">{kpis.tasaAprob}%</div>
                <div className="text-xs text-slate-500 mt-1">
                  {kpis.aprobados} aprobados · {kpis.aplazados} aplazados
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-sm text-slate-500">Promedio</div>
                <div className="text-3xl font-bold">{kpis.promedio ?? "N/A"}</div>
                <div className="text-xs text-slate-500 mt-1">Nota final promedio</div>
              </div>
            </div>

            {/* Riesgo / Alerta */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="font-bold">Cursos en Riesgo / Alerta</h3>
                <div className="text-sm text-slate-600">
                  Riesgo: {kpis.cursosRiesgo} · Alerta: {kpis.cursosAlerta} · Total cursos: {courses.length}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                {courses
                  .filter((c) => c.riesgo !== "OK")
                  .sort((a, b) => b.failPct - a.failPct)
                  .slice(0, 6)
                  .map((c) => (
                    <div
                      key={c.fileName}
                      className={`border rounded-lg p-4 ${
                        c.riesgo === "RIESGO" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
                      }`}
                    >
                      <div className="font-semibold">
                        {c.teacher || "N/A"} · {c.level || "N/A"} · {c.schedule || "N/A"}
                      </div>
                      <div className="text-sm text-slate-700 mt-1">
                        {c.aplazados}/{c.total} aplazados ({c.failPct}%) · Promedio: {c.avg ?? "N/A"}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 truncate">{c.fileName}</div>
                    </div>
                  ))}

                {courses.filter((c) => c.riesgo !== "OK").length === 0 && (
                  <div className="text-sm text-slate-600">No hay cursos marcados en riesgo o alerta con las reglas actuales.</div>
                )}
              </div>

              <div className="text-xs text-slate-500 mt-3">
                Reglas actuales: Riesgo si % aplazados ≥ 35. Alerta si % aplazados ≥ 20. (Esto se puede ajustar).
              </div>
            </div>

            {/* Chart */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
              <h3 className="font-bold mb-3">Aprobados / Aplazados por nivel</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartByLevel}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="level" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="aprobados" name="Aprobados" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="aplazados" name="Aplazados" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Filters + Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h3 className="font-bold">Lista de estudiantes</h3>
                  <div className="text-sm text-slate-600">
                    Mostrando {filteredStudents.length} de {students.length}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Buscar (nombre / cédula / curso)…"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                  </div>

                  <select
                    className="w-full py-2 px-3 rounded-lg border border-slate-300 bg-white"
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                  >
                    {levelOptions.map((l) => (
                      <option key={l} value={l}>{l === "All" ? "Todos los niveles" : l}</option>
                    ))}
                  </select>

                  <select
                    className="w-full py-2 px-3 rounded-lg border border-slate-300 bg-white"
                    value={teacher}
                    onChange={(e) => setTeacher(e.target.value)}
                  >
                    {teacherOptions.map((t) => (
                      <option key={t} value={t}>{t === "All" ? "Todos los profesores" : t}</option>
                    ))}
                  </select>

                  <select
                    className="w-full py-2 px-3 rounded-lg border border-slate-300 bg-white"
                    value={result}
                    onChange={(e) => setResult(e.target.value)}
                  >
                    <option value="All">Todos los resultados</option>
                    <option value="APROBADO">Aprobados</option>
                    <option value="APLAZADO">Aplazados</option>
                    <option value="OTRO">Otros</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="p-3 border-b border-slate-200">Resultado</th>
                      <th className="p-3 border-b border-slate-200">Estudiante</th>
                      <th className="p-3 border-b border-slate-200">Cédula</th>
                      <th className="p-3 border-b border-slate-200">Nivel</th>
                      <th className="p-3 border-b border-slate-200">Profesor</th>
                      <th className="p-3 border-b border-slate-200">Horario</th>
                      <th className="p-3 border-b border-slate-200">Nota final</th>
                      <th className="p-3 border-b border-slate-200">Archivo</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-100">
                    {filteredStudents.map((s) => (
                      <tr key={`${s.sourceFile}-${s.studentId}`} className="hover:bg-slate-50">
                        <td className="p-3">
                          {s.resultado === "APROBADO" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> Aprobado
                            </span>
                          ) : s.resultado === "APLAZADO" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">
                              <XCircle className="h-3 w-3" /> Aplazado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
                              <AlertTriangle className="h-3 w-3" /> Otro
                            </span>
                          )}
                        </td>

                        <td className="p-3 font-semibold text-slate-900">
                          {s.lastname} {s.name}
                          {s.phone ? <span className="ml-2 text-xs text-slate-500">(tel: {s.phone})</span> : null}
                        </td>
                        <td className="p-3 font-mono text-xs">{s.studentId}</td>
                        <td className="p-3">{s.level}</td>
                        <td className="p-3">{s.teacher}</td>
                        <td className="p-3">{s.schedule}</td>
                        <td className="p-3">{s.finalGrade ?? "N/A"}</td>
                        <td className="p-3 text-xs text-slate-500">{s.sourceFile}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!filteredStudents.length && (
                  <div className="p-8 text-center text-slate-500">No hay resultados con esos filtros.</div>
                )}
              </div>
            </div>

            <div className="text-xs text-slate-500 mt-4">
              Nota: Todo el procesamiento ocurre en tu navegador (no se suben archivos a ningún servidor).
            </div>
          </>
        )}
      </main>
    </div>
  );
}

