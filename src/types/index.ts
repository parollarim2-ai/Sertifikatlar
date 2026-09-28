export interface Student {
  id: string;
  fullName: string;
  birthDate?: string;
  passportOrId?: string;
  classId: string;
  assignedEmail?: string;
  assignedPassword?: string;
  status: 'pending' | 'certified' | 'error';
  certificateLink?: string;
  certificateDate?: string;
  certificateNumber?: string;
  hasError?: boolean;
  errorReason?: string;
  errorImage?: string; // base64 or URL
  createdAt: string;
}

export interface ClassGroup {
  id: string;
  name: string;
  teacherName: string;
  teacherPhone?: string;
  paidAmount: number; // in UZS
  pricePerStudent: number; // 5000 UZS
  notes?: string;
}

export interface EmailAccount {
  email: string;
  password?: string;
  isUsed: boolean;
  assignedToStudentId?: string;
  addedAt: string;
}

export interface TeacherSession {
  id: string;
  deviceId: string;
  teacherName: string;
  className: string;
  classId: string;
  deviceName: string;
  browser: string;
  os: string;
  screen?: string;
  lastActiveAt: string;
  createdAt: string;
  isBlocked: boolean;
  blockedReason?: string;
  blockedAt?: string;
}

export interface TeacherMessage {
  id: string;
  classId: string;
  className: string;
  teacherName: string;
  title: string;
  content: string;
  imageUrl?: string;
  priority: 'normal' | 'important' | 'urgent';
  createdAt: string;
  isRead: boolean;
  readAt?: string;
  readDeviceName?: string;
}

export interface TelegramUser {
  id: string; // string representation of chatId
  chatId: number;
  teacherName: string;
  classId: string;
  className: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  lastActiveAt: string;
  createdAt: string;
  isBlocked?: boolean;
  lastNotifiedAllDone?: boolean;
}

export interface AppState {
  classes: ClassGroup[];
  students: Student[];
  emailPool: EmailAccount[];
  sessions: TeacherSession[];
  messages: TeacherMessage[];
  telegramUsers: TelegramUser[];
}
