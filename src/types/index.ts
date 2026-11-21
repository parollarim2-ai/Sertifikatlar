export interface Student {
  id: string;
  fullName: string;
  birthDate?: string;
  passportOrId?: string;
  classId: string;
  assignedEmail?: string;
  assignedPassword?: string;
  status: 'pending' | 'certified' | 'error';
  isPaid?: boolean;
  paidAt?: string;
  certificateLink?: string;
  certificateDate?: string;
  certificateNumber?: string;
  hasError?: boolean;
  errorReason?: string;
  errorImage?: string; // base64 or URL
  createdAt: string;
  certifiedAt?: string; // EXACT timestamp with seconds when certificate was entered
  courseraVerified?: boolean;
  courseraRegisteredAt?: string;
  courseraQuizStatus?: 'pending' | 'solving' | 'completed' | 'error';
  courseraQuizCompletedAt?: string;
  projectType?: 'ai' | 'developer'; // 'ai' = Bir million promter (5,000 so'm), 'developer' = Besh million sun'iy intellekt yetakchilari (7,000 so'm)
  assignedLogin?: string; // Familya_ism formati
  loginVariantIndex?: number; // 0=fam_ism, 1=ism_fam, 2=fam_ism1, 3=fam_ism2...

  // AI track specific (Coursera / Bir million promter)
  aiStatus?: 'pending' | 'certified' | 'error';
  aiCertificateLink?: string;
  aiCertifiedAt?: string;
  aiCertificateDate?: string;
  aiCertificateDateVerified?: boolean;
  aiCertificateDateSource?: string;
  aiCertificateDateCheckedAt?: string;
  aiCertificateNumber?: string;
  aiHasError?: boolean;
  aiErrorReason?: string;
  aiErrorImage?: string;

  // Developer track specific (omp.aistudy.uz / Besh million sun'iy intellekt yetakchilari)
  devStatus?: 'pending' | 'certified' | 'error';
  devCertificateLink?: string;
  devCertifiedAt?: string;
  devCertificateDate?: string;
  devCertificateDateVerified?: boolean;
  devCertificateDateSource?: string;
  devCertificateDateCheckedAt?: string;
  devCertificateNumber?: string;
  devHasError?: boolean;
  devErrorReason?: string;
  devErrorImage?: string;
  devRegistered?: boolean;
  devRegisteredAt?: string;
}

export type PaymentMethod = 'naqd' | 'karta' | 'otkazma' | 'tekshirish';

export interface PaymentHistoryEntry {
  id: string;
  date: string; // ISO timestamp
  track: 'ai' | 'developer';
  previousAmount: number;
  newAmount: number;
  delta: number;
  method: PaymentMethod;
  note?: string;
  paidStudentCount: number;
  unverified?: boolean;
}

export interface ClassGroup {
  id: string;
  name: string;
  teacherName: string;
  teacherPhone?: string;
  paidAmount: number; // in UZS
  aiPaidAmount?: number; // in UZS for AI track
  devPaidAmount?: number; // in UZS for 5M Developer track
  pricePerStudent: number; // 5000 UZS (AI / Promter) or 7000 UZS (5M AI Yetakchilari)
  projectType?: 'ai' | 'developer'; // 'ai' = Bir million promter (5,000 so'm), 'developer' = Besh million sun'iy intellekt yetakchilari (7,000 so'm)
  notes?: string;
  isExternalSchool?: boolean; // Boshqa maktab belgisi
  schoolName?: string; // Masalan: "27-maktab"
  paymentUnverified?: boolean; // To'lov shubhali / Tekshirish kerak
  paymentMethod?: PaymentMethod;
  paymentNote?: string;
  lastPaymentAt?: string;
  paymentHistory?: PaymentHistoryEntry[];
}

export interface EmailAccount {
  email: string;
  password?: string;
  isUsed: boolean;
  assignedToStudentId?: string;
  addedAt: string;
}

export type GraphicsTier = 'lite' | 'medium' | 'high' | 'ultra';

export interface SessionActionLog {
  time: string;
  action: string;
}

export interface TeacherSession {
  id: string;
  deviceId: string;
  hardwareId?: string; // Cross-browser hardware fingerprint ID
  teacherName: string;
  className: string;
  classId: string;
  deviceName: string;
  browser: string;
  os: string;
  screen?: string;
  cpuCores?: number;
  gpuRenderer?: string;
  isOnline?: boolean;
  enteredAt?: string;
  leftAt?: string;
  lastActiveAt: string;
  createdAt: string;
  currentAction?: string;
  currentRole?: 'teacher' | 'admin';
  recentActions?: SessionActionLog[];
  isBlocked: boolean;
  blockHardware?: boolean;
  blockedReason?: string;
  blockedAt?: string;
  boundClassId?: string; // Boshqa maktab ustozi biriktirilgan sinf
  isExternalTeacher?: boolean; // Boshqa maktab ustozi ekanligi
  allowClassChangeOnce?: boolean; // Admin tomonidan qayta sinf tanlashga ruxsat berilganmi
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
  projectType?: 'ai' | 'developer';
  username?: string;
  firstName?: string;
  lastName?: string;
  lastActiveAt: string;
  createdAt: string;
  isBlocked?: boolean;
  lastNotifiedAllDone?: boolean;
}

export interface TeacherCertificate {
  id: string;
  fullName: string;
  subject?: string; // Fani / mutaxassisligi
  birthDate?: string;
  passportOrId?: string; // Pasport yoki 14 xonali JShShIR
  phone?: string;
  assignedEmail?: string;
  assignedPassword?: string;
  status: 'pending' | 'certified' | 'error';
  certificateLink?: string;
  certificateDate?: string;
  certificateNumber?: string;
  hasError?: boolean;
  errorReason?: string;
  errorImage?: string;
  price: number; // in UZS (default 5000)
  paidAmount: number; // in UZS
  paymentStatus: 'pending' | 'partial' | 'paid';
  notes?: string;
  createdAt: string;
  certifiedAt?: string; // Timestamp when teacher certificate was entered
}

export interface AppState {
  classes: ClassGroup[];
  students: Student[];
  emailPool: EmailAccount[];
  sessions: TeacherSession[];
  messages: TeacherMessage[];
  telegramUsers: TelegramUser[];
  teacherCertificates?: TeacherCertificate[];
}
