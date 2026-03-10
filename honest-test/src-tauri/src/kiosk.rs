use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use windows::Win32::Foundation::{HMODULE, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleA;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_ESCAPE, VK_F4, VK_LWIN, VK_MENU, VK_RWIN,
    VK_TAB,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, SetWindowsHookExA, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, WH_KEYBOARD_LL,
    SendNotifyMessageA,
};

static HOOK_HANDLE: AtomicUsize = AtomicUsize::new(0);
static KIOSK_ACTIVE: AtomicBool = AtomicBool::new(false);

pub fn set_kiosk_active(active: bool) {
    KIOSK_ACTIVE.store(active, Ordering::SeqCst);
}

pub fn is_kiosk_active() -> bool {
    KIOSK_ACTIVE.load(Ordering::SeqCst)
}

// Hook implementation
unsafe extern "system" fn low_level_keyboard_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if n_code < 0 {
        return CallNextHookEx(None, n_code, w_param, l_param);
    }

    let kbd = *(l_param.0 as *const KBDLLHOOKSTRUCT);
    let vk_code = kbd.vkCode;
    // let flags = kbd.flags;

    // Check if Alt is pressed
    // LLKHF_ALTDOWN check is simpler: (flags.0 & 0x20) != 0
    // But GetAsyncKeyState is robust
    let alt_down = (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000) != 0;
    let ctrl_down = (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
    let win_down = (GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000) != 0 || 
                   (GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000) != 0;

    let mut block = false;

    // Block Windows Keys outright
    if vk_code == VK_LWIN.0 as u32 || vk_code == VK_RWIN.0 as u32 {
        block = true;
    }

    // Block Alt+Tab
    if vk_code == VK_TAB.0 as u32 && alt_down {
        block = true;
    }

    // Block Win+Tab (Task View)
    if vk_code == VK_TAB.0 as u32 && win_down {
        block = true;
    }

    // Block Ctrl+Win+Arrow (Virtual Desktop Switch)
    let is_arrow_or_d = vk_code == 0x25 || vk_code == 0x27 || vk_code == 0x26 || vk_code == 0x28 || vk_code == 0x44; // Left, Right, Up, Down, D
    if is_arrow_or_d && win_down {
        block = true;
    }

    // Fallback: block any combination if Win key is down
    if win_down {
        block = true;
    }

    // Block Alt+Esc
    if vk_code == VK_ESCAPE.0 as u32 && alt_down {
        block = true;
    }

    // Block Ctrl+Esc (Start Menu)
    if vk_code == VK_ESCAPE.0 as u32 && ctrl_down {
        block = true;
    }

    // Block Alt+F4
    if vk_code == VK_F4.0 as u32 && alt_down {
        block = true;
    }

    if block {
        // Return 1 to block the key
        return LRESULT(1);
    }

    CallNextHookEx(None, n_code, w_param, l_param)
}

pub fn start_keyboard_hook() -> Result<(), String> {
    unsafe {
        // Check if already hooked
        if HOOK_HANDLE.load(Ordering::SeqCst) != 0 {
            return Ok(());
        }

        let h_mod = GetModuleHandleA(None).map_err(|e| e.to_string())?;
        
        // Cast HMODULE to HINSTANCE-like option for SetWindowsHookExA if needed by windows crate version
        // In windows 0.62.2, SetWindowsHookExA takes Option<HINSTANCE>
        // HMODULE and HINSTANCE are effectively the same in Win32, so we can transmute or cast
        let h_instance = std::mem::transmute::<HMODULE, windows::Win32::Foundation::HINSTANCE>(h_mod);

        let hook = SetWindowsHookExA(
            WH_KEYBOARD_LL,
            Some(low_level_keyboard_proc),
            Some(h_instance),
            0,
        ).map_err(|e| e.to_string())?;

        HOOK_HANDLE.store(hook.0 as usize, Ordering::SeqCst);
    }
    Ok(())
}

pub fn stop_keyboard_hook() {
    unsafe {
        let handle = HOOK_HANDLE.load(Ordering::SeqCst);
        if handle != 0 {
            let _ = UnhookWindowsHookEx(HHOOK(handle as *mut _));
            HOOK_HANDLE.store(0, Ordering::SeqCst);
        }
    }
}

pub fn disable_touchpad_gestures() -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // 1. AAPolicy for Precision Touchpads
    let path = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PrecisionTouchPad";
    if let Ok((key, _)) = hkcu.create_subkey_with_flags(path, KEY_WRITE | KEY_READ) {
        let _ = key.set_value("AAPolicy", &0u32);
    }

    // 2. TouchGestureSetting for Desktop Gestures (3-finger / 4-finger swipes)
    let desktop_path = "Control Panel\\Desktop";
    if let Ok((key, _)) = hkcu.create_subkey_with_flags(desktop_path, KEY_WRITE | KEY_READ) {
        let _ = key.set_value("TouchGestureSetting", &0u32);
    }
    
    // 3. EdgeSwipe for Edge Gestures
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let edge_path = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PrecisionTouchPad\\Status";
    if let Ok((key, _)) = hklm.create_subkey_with_flags(edge_path, KEY_WRITE | KEY_READ) {
        let _ = key.set_value("EdgeSwipe", &0u32);
    }

    // Notify explorer to pick up the change without restart (best effort!)
    unsafe {
        let _ = SendNotifyMessageA(
            windows::Win32::Foundation::HWND(0xffff as _), // HWND_BROADCAST
            0x001A, // WM_SETTINGCHANGE
            WPARAM(0),
            LPARAM(0),
        );
    }

    Ok(())
}

pub fn enable_touchpad_gestures() -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // 1. AAPolicy for Precision Touchpads
    let path = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PrecisionTouchPad";
    if let Ok(key) = hkcu.open_subkey_with_flags(path, KEY_WRITE | KEY_READ) {
        let _ = key.delete_value("AAPolicy");
    }

    // 2. TouchGestureSetting for Desktop Gestures (3-finger / 4-finger swipes)
    let desktop_path = "Control Panel\\Desktop";
    if let Ok((key, _)) = hkcu.create_subkey_with_flags(desktop_path, KEY_WRITE | KEY_READ) {
        let _ = key.set_value("TouchGestureSetting", &1u32);
    }

    // 3. EdgeSwipe for Edge Gestures
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let edge_path = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PrecisionTouchPad\\Status";
    if let Ok(key) = hklm.open_subkey_with_flags(edge_path, KEY_WRITE | KEY_READ) {
        let _ = key.delete_value("EdgeSwipe");
    }

    unsafe {
        let _ = SendNotifyMessageA(
            windows::Win32::Foundation::HWND(0xffff as _), // HWND_BROADCAST
            0x001A, // WM_SETTINGCHANGE
            WPARAM(0),
            LPARAM(0),
        );
    }

    Ok(())
}
