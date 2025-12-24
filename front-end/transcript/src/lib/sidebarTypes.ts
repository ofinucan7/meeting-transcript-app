export type MeetingPreview = {
  id: string;
  title: string;     // name of meeting
  dateISO: string;   // "date time of meeting"
};

export type TaskItem = {
  id: string;
  title: string;
  dueISO?: string;
  status: "todo" | "in_progress" | "done";
  details?: string;
};
