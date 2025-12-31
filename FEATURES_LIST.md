# 📋 Daftar Lengkap Fitur Desktop App HonesTest (Electron → Tauri)

Berdasarkan analisis referensi `honestest-desktop`, berikut adalah daftar lengkap fitur yang perlu diimplementasikan:

---

## 🎯 **1. AUTHENTICATION & USER MANAGEMENT**

### **1.1 Welcome Page (First Time Setup)**
- ✅ Multi-step onboarding (3 halaman)
  - Page 1: Welcome screen dengan logo
  - Page 2: Input ID (NIM) dan Name
  - Page 3: Display Device ID (auto-generated UUID)
- ✅ Generate unique Device ID (UUID v4)
- ✅ Save user data ke local storage (NIM, Name, Device ID)
- ✅ Auto-redirect ke Main Page jika sudah setup
- ✅ Exit app dialog

### **1.2 Main Page (Home)**
- ✅ Display user info (NIM, Name, Device ID)
- ✅ Edit user info (NIM, Name)
- ✅ Copy Device ID ke clipboard
- ✅ Load exam config file (`.ta12`)
- ✅ Input config password untuk decrypt
- ✅ Generate credential file (`.ta12c`) untuk enrollment
- ✅ Clear app data (reset semua data)
- ✅ Exit app
- ✅ Navigate ke Check Readiness page

---

## 📁 **2. FILE MANAGEMENT**

### **2.1 Exam Config File (.ta12)**
- ✅ **Load file**: File picker untuk memilih `.ta12` file
- ✅ **Decrypt**: Decrypt menggunakan AES-256-CTR
  - Key: SHA256(config_password) [32 bytes]
  - IV: MD5("ta12") [16 bytes]
- ✅ **Validate**: 
  - Validasi config password
  - Validasi allowed students (NIM, Name, Device ID)
  - Validasi exam date (start_date, end_date)
  - Validasi session ID (prevent reuse)
- ✅ **Save**: Simpan decrypted data ke local storage

### **2.2 Exam Result File (.ta12r)**
- ✅ **Create**: Generate encrypted result file
  - Format: ZIP archive dengan password
  - Contains: `data.json` + screenshots + webcam images
  - Password: `ENCRYPT_EXAM_FILE_PASSWORD` (env variable)
- ✅ **Save location**: `Documents/honestest/exam_results/`
- ✅ **Filename format**: `{course_title}_{exam_title}_result_{timestamp}.ta12r`
- ✅ **Upload**: Submit ke backend API (`/exam/submit`)
- ✅ **Fallback**: Save manual jika upload gagal

### **2.3 Credential File (.ta12c)**
- ✅ **Generate**: Create credential file untuk enrollment
- ✅ **Content**: JSON dengan NIM, Name, Device ID
- ✅ **Save location**: `Documents/honestest/`
- ✅ **Show file**: Open file location setelah generate

### **2.4 Local Storage (Electron Store)**
- ✅ **Save**: `store.save(key, value)`
- ✅ **Get**: `store.get(key)`
- ✅ **Delete**: `store.delete(key)`
- ✅ **Clear**: `store.clear()` (clear all data)
- ✅ **Keys stored**:
  - `user-nim`
  - `user-name`
  - `device-id`
  - `exam-data`
  - `exam-result`
  - `answers`
  - `proctoring_log`
  - `previous-session-id`
  - `submitted`
  - `API_URL`

---

## 📝 **3. EXAM TAKING**

### **3.1 Exam Waiting Page**
- ✅ Display exam info:
  - Course title & description
  - Exam title & description
  - Start date & end date
  - Time limit
  - Allowed attempts
- ✅ **Start Exam**:
  - Input start password (jika ada)
  - Validasi start password
  - Navigate ke Exam Start Page
- ✅ **Attempt Summary**:
  - List previous attempts
  - Display grade (jika `show_grade` enabled)
  - Review link (jika `enable_review` enabled)
- ✅ **Exit Exam**:
  - Input end password (jika ada)
  - Validasi end password
  - Stop exam mode
  - Clear exam data
- ✅ **Battery & Time Display**:
  - Battery percentage
  - Charging status
  - Current time (real-time update)

### **3.2 Exam Start Page**
- ✅ **Question Display**:
  - Sequential atau shuffled (berdasarkan setting)
  - Question navigation (Previous/Next)
  - Question list sidebar (grid 5 columns)
  - Question status indicator (answered/not answered)
- ✅ **Question Types**:
  - **Multiple Choice**: Radio button (single answer)
  - **Checkbox**: Multiple selection (limited by correct answers count)
  - **Essay**: Rich text editor (React Quill)
- ✅ **Answer Management**:
  - Save answers per question
  - Clear answer (untuk MC)
  - Rich text editor untuk essay
  - Auto-save answers
- ✅ **Timer**:
  - Countdown timer (hours:minutes:seconds)
  - Auto-submit ketika waktu habis
  - Display di sidebar
- ✅ **Submit Flow**:
  - Review answers (table dengan status)
  - Submit exam button
  - Generate `.ta12r` file
  - Upload ke backend
  - Success/Error dialog

### **3.3 Exam Review Page**
- ✅ Display all questions dengan answers
- ✅ Show correct answers (highlighted)
- ✅ Show points per question
- ✅ Calculate total score & percentage
- ✅ Show passing grade status (Passed/Not Pass)
- ✅ Navigate back to exam waiting page

---

## 👁️ **4. PROCTORING FEATURES**

### **4.1 Face Detection (MediaPipe)**
- ✅ **Face Landmarker**: 
  - MediaPipe Face Landmarker model
  - GPU acceleration
  - Real-time video processing
  - Detect up to 3 faces
- ✅ **Face Blendshapes**: 
  - Eye movement detection
  - Head movement detection
  - Facial expression analysis

### **4.2 Eye Movement Detection**
- ✅ **Glance Detection**:
  - Glance left (3x dalam 5 detik → capture)
  - Glance right (3x dalam 5 detik → capture)
  - Glance down (3x dalam 5 detik → capture)
  - Glance up (3x dalam 5 detik → capture)
- ✅ **Thresholds**:
  - Left: `eyeLookOutLeft > 0.92` && `eyeLookInLeft > 0.92`
  - Right: `eyeLookOutRight > 0.92` && `eyeLookInRight > 0.92`
  - Down: `eyeLookDownLeft > 0.93` && `eyeLookDownRight > 0.93`
  - Up: `eyeLookUpLeft > 0.3` && `eyeLookUpRight > 0.3`

### **4.3 Person Detection**
- ✅ **Count faces**: Detect jumlah orang di frame
- ✅ **Alerts**:
  - 0 faces: "No person detected" → capture + alert
  - 1 face: Normal
  - 2+ faces: "Multiple people detected" → capture + alert + block exam

### **4.4 Screenshot Capture**
- ✅ **Webcam screenshot**: Capture dari webcam (JPEG)
- ✅ **Screen screenshot**: Capture desktop screen (PNG)
- ✅ **Save location**: `Documents/honestest/temp_exam_result/`
- ✅ **Naming**:
  - Webcam: `g_{id}.jpeg`
  - Screen: `s_{id}.png`
- ✅ **Rate limiting**: Max 1 screenshot per 3 detik

### **4.5 Proctoring Logs**
- ✅ **Log entries**:
  - Description (string)
  - Time (timestamp)
  - Image ID (UUID)
  - Images (webcam + screen)
- ✅ **Save**: Store di local storage
- ✅ **Include in result**: Attach ke `.ta12r` file

### **4.6 Keyboard Monitoring**
- ✅ **Detect suspicious key combinations**:
  - `Ctrl+C` → capture
  - `Ctrl+V` → capture
  - `Ctrl+R` → capture
  - `Ctrl+P` → capture
  - `Alt+Tab` → capture
  - `Alt+*` → capture
  - `Meta+*` → capture
  - `Ctrl+Shift+Delete` → capture
- ✅ **Log**: Save ke proctoring log dengan description

### **4.7 Check Readiness Page**
- ✅ Test webcam & face detection
- ✅ Display detection results (movement, person count)
- ✅ Real-time preview dengan canvas overlay
- ✅ Navigate back to main page

---

## 🔒 **5. SECURITY FEATURES**

### **5.1 Exam Mode (Kiosk Mode)**
- ✅ **Activate**: 
  - Fullscreen mode
  - Kiosk mode
  - Disable minimize
  - Always on top
- ✅ **Window Control**:
  - Block Alt+Tab
  - Block Ctrl+I (DevTools)
  - Block window close (Alt+F4)
  - Auto-focus jika window blur
- ✅ **Process Killing**:
  - Kill apps setiap 30 detik:
    - Windows: Telegram, Discord, Chrome, Edge, WhatsApp, TeamViewer, dll
    - Linux: telegram, Discord, firefox, chrome, obs, zoom
- ✅ **Deactivate**: 
  - Exit fullscreen
  - Enable minimize
  - Remove all restrictions

### **5.2 Virtual Machine Detection**
- ✅ **Check VM**: Detect jika running di VM
- ✅ **Action**: 
  - Jika VM detected → Enable kiosk mode
  - Block shortcuts
  - Prevent close

### **5.3 Password Protection**
- ✅ **Config Password**: Untuk decrypt `.ta12` file
- ✅ **Start Password**: Untuk mulai exam
- ✅ **End Password**: Untuk exit exam
- ✅ **Validation**: Real-time validation dengan error messages

### **5.4 Session Management**
- ✅ **Session ID**: Generate unique session ID per exam
- ✅ **Prevent reuse**: Block config file yang sudah digunakan
- ✅ **Save**: Store `previous-session-id` di local storage

---

## 🎨 **6. UI/UX FEATURES**

### **6.1 Components**
- ✅ **UI Components** (Radix UI):
  - Button
  - Input
  - Dialog
  - Alert Dialog
  - Checkbox
  - Radio Group
  - Select
  - Table
  - Label
  - Dropdown Menu
- ✅ **Custom Components**:
  - Countdown Timer
  - Spinner
  - Bottom Bar
- ✅ **Icons**: Lucide React icons
- ✅ **Toast**: Sonner (toast notifications)

### **6.2 Styling**
- ✅ **Tailwind CSS**: Utility-first CSS
- ✅ **Dark Mode**: next-themes (optional)
- ✅ **Responsive**: Mobile-friendly layout
- ✅ **Animations**: tailwindcss-animate

### **6.3 Rich Text Editor**
- ✅ **React Quill**: Untuk essay questions
- ✅ **Features**:
  - Headers, fonts, sizes
  - Bold, italic, underline, strike
  - Colors, backgrounds
  - Lists (ordered, bullet)
  - Links, images, videos
  - Image resize (quill-resize-image)

### **6.4 Routing**
- ✅ **React Router**: Client-side routing
- ✅ **Routes**:
  - `/` → Welcome Page
  - `/main` → Main Page
  - `/check-readiness` → Check Readiness
  - `/exam` → Exam Waiting Page
  - `/exam-start` → Exam Start Page
  - `/exam-review` → Exam Review Page
  - `/virtual-machine-detected` → VM Detection Page

---

## 🔧 **7. SYSTEM INTEGRATION**

### **7.1 System Information**
- ✅ **Battery**: 
  - Get battery percentage
  - Check charging status
  - Real-time updates (setiap 2 detik)
- ✅ **Device ID**: 
  - Generate unique device ID
  - Persistent storage
- ✅ **App Path**: Get application path
- ✅ **Documents Path**: Get Documents folder path

### **7.2 File System**
- ✅ **Create directories**: Auto-create jika tidak ada
- ✅ **Save files**: Write files ke disk
- ✅ **Read files**: Read files dari disk
- ✅ **Delete files**: Cleanup temp files
- ✅ **Show file**: Open file location (OS file manager)

### **7.3 Audio/Video**
- ✅ **Volume Control**: 
  - Set volume to 100%
  - Unmute
- ✅ **Webcam**: 
  - Access webcam stream
  - Screenshot capture
  - Video constraints (15-25 FPS)
- ✅ **Screen Capture**: Desktop screenshot

### **7.4 7-Zip Integration**
- ✅ **Archive creation**: Create ZIP dengan password
- ✅ **Archive extraction**: Extract ZIP dengan password
- ✅ **Platform support**:
  - Windows: `7zr.exe`
  - Linux: `7zz`
- ✅ **Path resolution**: Auto-detect 7z executable

---

## 🌐 **8. API INTEGRATION**

### **8.1 Backend API**
- ✅ **API URL**: Configurable (env variable)
- ✅ **Submit Exam Result**: 
  - `POST /exam/submit`
  - Multipart form data
  - File: `.ta12r`
- ✅ **Error Handling**:
  - Connection error → Save file manual
  - Validation error → Show message
  - Success → Show success message

### **8.2 Axios**
- ✅ HTTP client untuk API calls
- ✅ FormData untuk file upload
- ✅ Error handling

---

## 📦 **9. BUILD & DISTRIBUTION**

### **9.1 Build Scripts**
- ✅ **Development**:
  - `dev:react` → Vite dev server
  - `dev:electron` → Electron dev mode
- ✅ **Production**:
  - `build` → Build React app
  - `transpile:electron` → Compile TypeScript
- ✅ **Distribution**:
  - `dist:win` → Windows build
  - `dist:linux` → Linux build
  - `dist:mac` → macOS build (ARM64)

### **9.2 Electron Builder**
- ✅ **Config**: `electron-builder.json`
- ✅ **Platforms**: Windows, Linux, macOS
- ✅ **Output**: Executable files

---

## 🧪 **10. TESTING & DEBUGGING**

### **10.1 Development Mode**
- ✅ **DevTools**: Auto-open di development
- ✅ **Hot Reload**: Vite HMR
- ✅ **Logging**: Console logs

### **10.2 Error Handling**
- ✅ **Try-catch**: Error handling di semua async operations
- ✅ **User feedback**: Toast notifications untuk errors
- ✅ **Fallback**: Manual file save jika upload gagal

---

## 📋 **11. DATA STRUCTURES**

### **11.1 Exam Data**
```typescript
{
  examData: {
    id: number
    title: string
    description: string
    start_date: string
    end_date: string
    start_password: string | null
    end_password: string | null
    config_password: string
    time_limit: number (seconds)
    allowed_attempts: number
    enable_proctoring: boolean
    cheating_limit: number
    shuffle_questions: boolean
    shuffle_options: boolean
    enable_review: boolean
    show_grade: boolean
    passing_grade: number
    sequential: boolean
    course_title: string
    session_id: string
  }
  courseData: {...}
  questionsData: [...]
  allowedUserData: [...]
}
```

### **11.2 Answer Data**
```typescript
{
  [questionId]: answer | answer[]
}
```

### **11.3 Proctoring Log**
```typescript
[
  {
    description: string
    time: Date
    image_id: string
  }
]
```

### **11.4 Exam Result Data**
```typescript
{
  exam_id: number
  user_username: string
  total_score: number
  expected_score: number
  attempt: number
  created_at: Date
  answers: {...}
}
```

---

## 🎯 **12. MIGRATION NOTES (Electron → Tauri)**

### **12.1 IPC Communication**
- **Electron**: `ipcMain.handle()` / `ipcRenderer.invoke()`
- **Tauri**: `#[tauri::command]` / `invoke()`

### **12.2 File System**
- **Electron**: `fs` (Node.js)
- **Tauri**: `@tauri-apps/plugin-fs` atau `std::fs`

### **12.3 Storage**
- **Electron**: `electron-store`
- **Tauri**: `@tauri-apps/plugin-store` atau SQLite

### **12.4 System Info**
- **Electron**: `systeminformation` package
- **Tauri**: Custom Rust commands

### **12.5 Process Management**
- **Electron**: `child_process.exec()`
- **Tauri**: `std::process::Command`

### **12.6 Window Management**
- **Electron**: `BrowserWindow` API
- **Tauri**: `Window` API atau `tauri.conf.json`

### **12.7 Screenshot**
- **Electron**: `desktopCapturer`
- **Tauri**: `screenshots` crate atau custom implementation

### **12.8 7-Zip**
- **Electron**: Execute `7zr.exe` / `7zz`
- **Tauri**: Execute via `std::process::Command` atau Rust crate

---

## ✅ **CHECKLIST IMPLEMENTASI**

### **Phase 1: Core Setup**
- [ ] Setup Tauri project dengan React + Vite
- [ ] Setup routing (React Router)
- [ ] Setup UI components (Radix UI atau shadcn/ui)
- [ ] Setup Tailwind CSS
- [ ] Setup state management (jika perlu)

### **Phase 2: File Operations**
- [ ] Implement decrypt `.ta12` file
- [ ] Implement encrypt `.ta12r` file
- [ ] Implement generate `.ta12c` file
- [ ] Implement file save/read operations
- [ ] Implement 7-Zip integration

### **Phase 3: Exam Core**
- [ ] Welcome Page
- [ ] Main Page
- [ ] Exam Waiting Page
- [ ] Exam Start Page
- [ ] Exam Review Page

### **Phase 4: Proctoring**
- [ ] MediaPipe Face Landmarker integration
- [ ] Webcam access
- [ ] Eye movement detection
- [ ] Person detection
- [ ] Screenshot capture
- [ ] Keyboard monitoring
- [ ] Proctoring log management

### **Phase 5: Security**
- [ ] Exam mode (kiosk mode)
- [ ] Window control
- [ ] Process killing
- [ ] VM detection
- [ ] Password validation

### **Phase 6: System Integration**
- [ ] Battery monitoring
- [ ] Device ID generation
- [ ] File system operations
- [ ] Audio control

### **Phase 7: API Integration**
- [ ] Submit exam result
- [ ] Error handling
- [ ] Fallback mechanisms

### **Phase 8: Polish**
- [ ] Error handling
- [ ] Loading states
- [ ] Toast notifications
- [ ] UI/UX improvements
- [ ] Testing

---

**Total Fitur: 100+ fitur yang perlu diimplementasikan!** 🚀

