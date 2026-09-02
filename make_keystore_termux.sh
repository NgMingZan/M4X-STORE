#!/data/data/com.termux/files/usr/bin/bash
set -e

OUT="$HOME/storage/downloads"
KS="$HOME/m4x-store-release.jks"
B64="$OUT/M4X_ANDROID_KEYSTORE_BASE64.txt"

echo "=== M4X STORE - TẠO KHÓA KÝ ỔN ĐỊNH ==="
echo "Khóa này phải giữ lâu dài. Mất khóa sẽ không thể cập nhật đè app đã phát hành."
echo

pkg install openjdk-17 coreutils -y

if [ -f "$KS" ]; then
  echo "Đã có $KS - không ghi đè."
else
  keytool -genkeypair -v \
    -keystore "$KS" \
    -alias m4xstore \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000
fi

base64 "$KS" | tr -d '\n' > "$B64"

echo
echo "Xong."
echo "Keystore: $KS"
echo "Base64 để dán GitHub Secret: $B64"
echo
echo "Tạo GitHub Actions Secrets:"
echo "ANDROID_KEYSTORE_BASE64 = nội dung file trên"
echo "ANDROID_KEYSTORE_PASSWORD = mật khẩu keystore bạn vừa đặt"
echo "ANDROID_KEY_ALIAS = m4xstore"
echo "ANDROID_KEY_PASSWORD = mật khẩu key bạn vừa đặt"
