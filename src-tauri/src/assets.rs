//! Immutable, note-owned raster assets. No user-supplied paths or remote URLs.
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_PIXELS: u64 = 32_000_000;
type Result<T> = std::result::Result<T, String>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub id: String,
    pub mime: String,
    pub byte_length: usize,
    pub width: u32,
    pub height: u32,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageData {
    #[serde(flatten)]
    pub info: ImageInfo,
    pub bytes: Vec<u8>,
}

fn be16(b: &[u8]) -> u32 {
    u16::from_be_bytes([b[0], b[1]]) as u32
}
fn be32(b: &[u8]) -> u32 {
    u32::from_be_bytes([b[0], b[1], b[2], b[3]])
}
fn le24(b: &[u8]) -> u32 {
    b[0] as u32 | (b[1] as u32) << 8 | (b[2] as u32) << 16
}

/// Header/size validation, not a full raster decoder. Browser decoding remains
/// isolated from note markup. Animated formats are deferred until frame budgets exist.
pub fn inspect(bytes: &[u8]) -> Result<(&'static str, u32, u32)> {
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
        return Err("Images must be between 1 byte and 10 MiB".into());
    }
    let result = if bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        && bytes.len() >= 33
        && &bytes[12..16] == b"IHDR"
        && be32(&bytes[8..12]) == 13
    {
        let mut offset = 8usize;
        let mut ended = false;
        while offset + 12 <= bytes.len() {
            let size = be32(&bytes[offset..offset + 4]) as usize;
            let end = offset
                .checked_add(size)
                .and_then(|n| n.checked_add(12))
                .ok_or("Invalid PNG chunk")?;
            if end > bytes.len() {
                return Err("Truncated PNG".into());
            }
            let kind = &bytes[offset + 4..offset + 8];
            if kind == b"acTL" {
                return Err("Animated images are not supported yet".into());
            }
            if kind == b"IEND" {
                ended = true;
                break;
            }
            offset = end;
        }
        if !ended {
            return Err("PNG is missing its end chunk".into());
        }
        ("image/png", be32(&bytes[16..20]), be32(&bytes[20..24]))
    } else if bytes.starts_with(&[0xff, 0xd8]) {
        let mut offset = 2usize;
        let mut dimensions = None;
        while offset + 4 <= bytes.len() {
            if bytes[offset] != 0xff {
                return Err("Invalid JPEG marker".into());
            }
            while offset < bytes.len() && bytes[offset] == 0xff {
                offset += 1;
            }
            let marker = *bytes.get(offset).ok_or("Truncated JPEG")?;
            offset += 1;
            if marker == 0xda || marker == 0xd9 {
                break;
            }
            if marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
                continue;
            }
            if offset + 2 > bytes.len() {
                return Err("Truncated JPEG".into());
            }
            let size = be16(&bytes[offset..offset + 2]) as usize;
            if size < 2 || offset + size > bytes.len() {
                return Err("Invalid JPEG segment".into());
            }
            if [
                0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
            ]
            .contains(&marker)
            {
                if size < 8 {
                    return Err("Truncated JPEG dimensions".into());
                }
                dimensions = Some((
                    "image/jpeg",
                    be16(&bytes[offset + 5..offset + 7]),
                    be16(&bytes[offset + 3..offset + 5]),
                ));
                break;
            }
            offset += size;
        }
        dimensions.ok_or("JPEG is missing dimensions")?
    } else if bytes.len() >= 30 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        let declared = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
        if declared.checked_add(8) != Some(bytes.len()) {
            return Err("Invalid WebP length".into());
        }
        match &bytes[12..16] {
            b"VP8X" => {
                if bytes[20] & 2 != 0 {
                    return Err("Animated images are not supported yet".into());
                }
                (
                    "image/webp",
                    le24(&bytes[24..27]) + 1,
                    le24(&bytes[27..30]) + 1,
                )
            }
            b"VP8 " if &bytes[23..26] == b"\x9d\x01\x2a" => (
                "image/webp",
                (u16::from_le_bytes([bytes[26], bytes[27]]) & 0x3fff) as u32,
                (u16::from_le_bytes([bytes[28], bytes[29]]) & 0x3fff) as u32,
            ),
            b"VP8L" if bytes[20] == 0x2f => {
                let bits = u32::from_le_bytes(bytes[21..25].try_into().unwrap());
                (
                    "image/webp",
                    (bits & 0x3fff) + 1,
                    ((bits >> 14) & 0x3fff) + 1,
                )
            }
            _ => return Err("Unsupported WebP header".into()),
        }
    } else {
        return Err("Use a static PNG, JPEG, or WebP image".into());
    };
    if result.1 == 0
        || result.2 == 0
        || result.1 > 16384
        || result.2 > 16384
        || result.1 as u64 * result.2 as u64 > MAX_PIXELS
    {
        return Err("Image exceeds the 32 megapixel / 16384 pixel dimension limit".into());
    }
    Ok(result)
}

fn id(value: &str) -> Result<()> {
    if Uuid::parse_str(value)
        .map_err(|_| "Invalid asset identifier")?
        .to_string()
        != value
    {
        return Err("Invalid asset identifier".into());
    }
    Ok(())
}
fn directory(root: &Path, note_id: &str, create: bool) -> Result<PathBuf> {
    id(note_id)?;
    let base = root.join("assets");
    if create {
        fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    }
    if base.canonicalize().map_err(|e| e.to_string())? != base {
        return Err("Asset directory is redirected".into());
    }
    let path = base.join(note_id);
    if create {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    if path.canonicalize().map_err(|e| e.to_string())? != path {
        return Err("Note asset directory is redirected".into());
    }
    Ok(path)
}
pub fn import(root: &Path, note_id: &str, bytes: &[u8], mime: &str) -> Result<ImageInfo> {
    let (detected, width, height) = inspect(bytes)?;
    if !mime.is_empty() && mime != detected {
        return Err("Image type does not match its bytes".into());
    }
    let id = Uuid::new_v4().to_string();
    let path = directory(root, note_id, true)?.join(format!("{id}.image"));
    super::store::atomic_write(&path, bytes)?;
    Ok(ImageInfo {
        id,
        mime: detected.into(),
        byte_length: bytes.len(),
        width,
        height,
    })
}
pub fn read(root: &Path, note_id: &str, asset_id: &str) -> Result<ImageData> {
    id(asset_id)?;
    let path = directory(root, note_id, false)?.join(format!("{asset_id}.image"));
    let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() > MAX_IMAGE_BYTES as u64
    {
        return Err("Invalid asset file".into());
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let (mime, width, height) = inspect(&bytes)?;
    Ok(ImageData {
        info: ImageInfo {
            id: asset_id.into(),
            mime: mime.into(),
            byte_length: bytes.len(),
            width,
            height,
        },
        bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn headers_reject_large_truncated_and_animated_images() {
        let png = include_bytes!("../icons/icon.png");
        assert_eq!(inspect(png).unwrap().0, "image/png");
        assert!(inspect(&png[..35]).is_err());
        let mut huge = png.to_vec();
        huge[16..20].copy_from_slice(&100_000u32.to_be_bytes());
        assert!(inspect(&huge).unwrap_err().contains("dimension limit"));
        let mut animated = png.to_vec();
        animated[12..16].copy_from_slice(b"acTL");
        assert!(inspect(&animated).is_err());
        assert!(inspect(&vec![0; MAX_IMAGE_BYTES + 1]).is_err());
        assert!(inspect(b"GIF89a").is_err());
    }
    #[test]
    fn jpeg_and_webp_dimensions_are_bounded() {
        let jpeg = [255, 216, 255, 192, 0, 8, 8, 0, 16, 0, 24, 1];
        assert_eq!(inspect(&jpeg).unwrap(), ("image/jpeg", 24, 16));
        assert!(inspect(&jpeg[..9]).is_err());
        let mut webp = vec![0; 30];
        webp[..4].copy_from_slice(b"RIFF");
        webp[4..8].copy_from_slice(&22u32.to_le_bytes());
        webp[8..16].copy_from_slice(b"WEBPVP8X");
        webp[24] = 15;
        webp[27] = 23;
        assert_eq!(inspect(&webp).unwrap(), ("image/webp", 16, 24));
        webp[20] = 2;
        assert!(inspect(&webp).unwrap_err().contains("Animated"));
    }
}
