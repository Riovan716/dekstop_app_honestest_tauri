use std::sync::atomic::{AtomicUsize, Ordering};
use windows::Win32::Foundation::{HMODULE, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleA;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_ESCAPE, VK_F4, VK_LWIN, VK_MENU, VK_RWIN,
    VK_TAB,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, SetWindowsHookExA, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, WH_KEYBOARD_LL,
};

static HOOK_HANDLE: AtomicUsize = AtomicUsize::new(0);

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

    let mut block = false;

    // Block Alt+Tab
    if vk_code == VK_TAB.0 as u32 && alt_down {
        block = true;
    }

    // Block Windows Keys (Start Menu)
    if vk_code == VK_LWIN.0 as u32 || vk_code == VK_RWIN.0 as u32 {
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
