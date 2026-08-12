using System;
using System.Drawing;
using System.Windows.Forms;

namespace PrivateDirectoryServer
{
    /// Small popup showing a scannable QR code plus a copyable address and
    /// access code, so getting the server open on a phone doesn't require
    /// typing a URL or IP address by hand.
    internal sealed class PhoneAccessForm : Form
    {
        public PhoneAccessForm(string url, string accessToken)
        {
            Text = "Open on Your Phone";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(320, 510);

            var qr = QrCode.EncodeText(url, QrEcc.Medium);
            var qrImage = qr.ToBitmap(6, 3);

            var pictureBox = new PictureBox
            {
                Image = qrImage,
                SizeMode = PictureBoxSizeMode.Zoom,
                Size = new Size(280, 280),
                Location = new Point(20, 15),
            };

            var addressLabel = new Label { Text = "Address:", Location = new Point(20, 303), AutoSize = true };
            var addressBox = new TextBox { Text = url, ReadOnly = true, Location = new Point(20, 321), Width = 280 };

            var copyAddressButton = new Button { Text = "Copy Address", Location = new Point(20, 350), Width = 135, Height = 28 };
            copyAddressButton.Click += (s, e) => Clipboard.SetText(url);

            var copyTokenButton = new Button
            {
                Text = "Copy Access Code",
                Location = new Point(165, 350),
                Width = 135,
                Height = 28,
                Enabled = !string.IsNullOrEmpty(accessToken),
            };
            copyTokenButton.Click += (s, e) => Clipboard.SetText(accessToken ?? "");

            var noteLabel = new Label
            {
                Text = "Scan with your phone's camera, or open the address above. Your phone must be on "
                     + "the same Wi-Fi network as this PC. When asked, enter the access code (use \"Copy Access Code\").",
                Location = new Point(20, 386),
                Size = new Size(280, 76),
            };

            var closeButton = new Button
            {
                Text = "Close",
                Location = new Point(205, 468),
                Width = 95,
                Height = 28,
                DialogResult = DialogResult.OK,
            };

            Controls.Add(pictureBox);
            Controls.Add(addressLabel);
            Controls.Add(addressBox);
            Controls.Add(copyAddressButton);
            Controls.Add(copyTokenButton);
            Controls.Add(noteLabel);
            Controls.Add(closeButton);

            AcceptButton = closeButton;
        }
    }
}
