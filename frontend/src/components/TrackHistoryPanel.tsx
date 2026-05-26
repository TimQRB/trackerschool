import React, { useState } from "react";
import { api } from "../api";

interface TrackHistoryPanelProps {
  selectedStudentId: number | null;
  onTrackLoaded: (points: any[] | null) => void;
}

export default function TrackHistoryPanel({ selectedStudentId, onTrackLoaded }: TrackHistoryPanelProps) {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function fetchHistory() {
    if (!selectedStudentId) {
      alert("Сначала выберите ученика в списке!");
      return;
    }
    if (!selectedDate) {
      alert("Выберите дату!");
      return;
    }

    try {
      setLoading(true);
      
      const now = new Date();
      const targetDate = new Date(selectedDate);
      targetDate.setHours(0, 0, 0, 0);

      const diffInMs = now.getTime() - targetDate.getTime();
      let hours = Math.ceil(diffInMs / (1000 * 60 * 60));

      if (hours > 168) {
        alert("История доступна только за последние 7 дней (168 часов).");
        hours = 168;
      }
      if (hours < 1) hours = 24;

      const points = await api.track(selectedStudentId, hours);

      const dayStart = new Date(selectedDate).setHours(0, 0, 0, 0);
      const dayEnd = new Date(selectedDate).setHours(23, 59, 59, 999);
      
      const filteredPoints = points.filter((p: any) => {
        const time = new Date(p.recorded_at).getTime();
        return time >= dayStart && time <= dayEnd;
      });

      filteredPoints.sort((a, b) => 
        new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
      );

      if (filteredPoints.length === 0) {
        alert("Нет данных о перемещениях за этот день.");
        onTrackLoaded(null);
      } else {
        onTrackLoaded(filteredPoints);
      }
    } catch (err) {
      console.error(err);
      alert("Ошибка загрузки истории");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid #e2e8f0" }}>
      <h3 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
        🕒 История за день
      </h3>
      <div style={{ display: "flex", gap: "8px" }}>
        <input 
          type="date" 
          value={selectedDate} 
          max={new Date().toISOString().split("T")[0]}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{ 
            flex: 1, 
            padding: "6px 10px", 
            borderRadius: "6px", 
            border: "1px solid #cbd5e1", 
            fontSize: "13px",
            background: "white",
            outline: "none"
          }}
        />
        <button 
          onClick={fetchHistory} 
          disabled={loading || !selectedStudentId}
          style={{ 
            padding: "6px 14px", 
            background: "#2563eb", 
            color: "white", 
            border: "none", 
            borderRadius: "6px", 
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 500,
            opacity: loading || !selectedStudentId ? 0.6 : 1
          }}
        >
          {loading ? "..." : "ОК"}
        </button>
        {selectedDate && (
          <button 
            onClick={() => { setSelectedDate(""); onTrackLoaded(null); }}
            style={{ 
              padding: "6px 10px", 
              background: "#64748b", 
              color: "white", 
              border: "none", 
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "13px"
            }}
          >
            ❌
          </button>
        )}
      </div>
    </div>
  );
}