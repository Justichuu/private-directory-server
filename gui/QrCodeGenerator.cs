// Ported from the TypeScript/JavaScript QR Code generator library by Project
// Nayuki (https://www.nayuki.io/page/qr-code-generator-library), MIT License,
// trimmed to UTF-8 byte-mode encoding only (all this app needs for URLs).
//
// Copyright (c) Project Nayuki. (MIT License)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal in
// the Software without restriction, including without limitation the rights to
// use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
// the Software, and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:
// - The above copyright notice and this permission notice shall be included in
//   all copies or substantial portions of the Software.
// - The Software is provided "as is", without warranty of any kind, express or
//   implied, including but not limited to the warranties of merchantability,
//   fitness for a particular purpose and noninfringement. In no event shall the
//   authors or copyright holders be liable for any claim, damages or other
//   liability, whether in an action of contract, tort or otherwise, arising from,
//   out of or in connection with the Software or the use or other dealings in the
//   Software.

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Text;

namespace PrivateDirectoryServer
{
    internal enum QrEcc
    {
        Low = 0,
        Medium = 1,
        Quartile = 2,
        High = 3,
    }

    internal sealed class QrCode
    {
        public int Version { get; private set; }
        public int Size { get; private set; }
        public int Mask { get; private set; }

        private QrEcc _ecc;
        private bool[][] _modules;
        private bool[][] _isFunction;

        public static QrCode EncodeText(string text, QrEcc ecl)
        {
            byte[] data = Encoding.UTF8.GetBytes(text);

            int version;
            int dataUsedBits = 0;
            for (version = 1; ; version++)
            {
                int ccBits = NumCharCountBits(version);
                int dataCapacityBits = GetNumDataCodewords(version, ecl) * 8;
                long usedBits = 4L + ccBits + (long)data.Length * 8;
                if (usedBits <= dataCapacityBits)
                {
                    dataUsedBits = (int)usedBits;
                    break;
                }
                if (version >= 40) throw new InvalidOperationException("Text too long for a QR code.");
            }

            foreach (var newEcl in new[] { QrEcc.Medium, QrEcc.Quartile, QrEcc.High })
            {
                if (dataUsedBits <= GetNumDataCodewords(version, newEcl) * 8) ecl = newEcl;
            }

            var bb = new List<int>();
            AppendBits(0x4, 4, bb);
            AppendBits(data.Length, NumCharCountBits(version), bb);
            foreach (byte b in data) AppendBits(b, 8, bb);

            int capacityBits = GetNumDataCodewords(version, ecl) * 8;
            AppendBits(0, Math.Min(4, capacityBits - bb.Count), bb);
            AppendBits(0, (8 - bb.Count % 8) % 8, bb);
            for (int padByte = 0xEC; bb.Count < capacityBits; padByte ^= 0xEC ^ 0x11)
                AppendBits(padByte, 8, bb);

            byte[] dataCodewords = new byte[bb.Count / 8];
            for (int i = 0; i < bb.Count; i++)
                dataCodewords[i >> 3] |= (byte)(bb[i] << (7 - (i & 7)));

            return new QrCode(version, ecl, dataCodewords, -1);
        }

        public bool GetModule(int x, int y)
        {
            return x >= 0 && x < Size && y >= 0 && y < Size && _modules[y][x];
        }

        public Bitmap ToBitmap(int scale, int border)
        {
            int dim = (Size + border * 2) * scale;
            var bitmap = new Bitmap(dim, dim);
            using (var g = Graphics.FromImage(bitmap))
            {
                g.Clear(Color.White);
                using (var brush = new SolidBrush(Color.Black))
                {
                    for (int y = 0; y < Size; y++)
                    {
                        for (int x = 0; x < Size; x++)
                        {
                            if (GetModule(x, y))
                                g.FillRectangle(brush, (x + border) * scale, (y + border) * scale, scale, scale);
                        }
                    }
                }
            }
            return bitmap;
        }

        private QrCode(int version, QrEcc ecl, byte[] dataCodewords, int msk)
        {
            Version = version;
            _ecc = ecl;
            Size = version * 4 + 17;
            _modules = new bool[Size][];
            _isFunction = new bool[Size][];
            for (int i = 0; i < Size; i++)
            {
                _modules[i] = new bool[Size];
                _isFunction[i] = new bool[Size];
            }

            DrawFunctionPatterns();
            byte[] allCodewords = AddEccAndInterleave(dataCodewords);
            DrawCodewords(allCodewords);

            if (msk == -1)
            {
                int minPenalty = int.MaxValue;
                for (int i = 0; i < 8; i++)
                {
                    ApplyMask(i);
                    DrawFormatBits(i);
                    int penalty = GetPenaltyScore();
                    if (penalty < minPenalty)
                    {
                        msk = i;
                        minPenalty = penalty;
                    }
                    ApplyMask(i);
                }
            }
            Mask = msk;
            ApplyMask(msk);
            DrawFormatBits(msk);
            _isFunction = null;
        }

        private void DrawFunctionPatterns()
        {
            for (int i = 0; i < Size; i++)
            {
                SetFunctionModule(6, i, i % 2 == 0);
                SetFunctionModule(i, 6, i % 2 == 0);
            }

            DrawFinderPattern(3, 3);
            DrawFinderPattern(Size - 4, 3);
            DrawFinderPattern(3, Size - 4);

            int[] alignPatPos = GetAlignmentPatternPositions();
            int numAlign = alignPatPos.Length;
            for (int i = 0; i < numAlign; i++)
            {
                for (int j = 0; j < numAlign; j++)
                {
                    if (!(i == 0 && j == 0 || i == 0 && j == numAlign - 1 || i == numAlign - 1 && j == 0))
                        DrawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
                }
            }

            DrawFormatBits(0);
            DrawVersion();
        }

        private void DrawFormatBits(int mask)
        {
            int data = FormatBitsForEcc(_ecc) << 3 | mask;
            int rem = data;
            for (int i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
            int bits = (data << 10 | rem) ^ 0x5412;

            for (int i = 0; i <= 5; i++) SetFunctionModule(8, i, GetBit(bits, i));
            SetFunctionModule(8, 7, GetBit(bits, 6));
            SetFunctionModule(8, 8, GetBit(bits, 7));
            SetFunctionModule(7, 8, GetBit(bits, 8));
            for (int i = 9; i < 15; i++) SetFunctionModule(14 - i, 8, GetBit(bits, i));

            for (int i = 0; i < 8; i++) SetFunctionModule(Size - 1 - i, 8, GetBit(bits, i));
            for (int i = 8; i < 15; i++) SetFunctionModule(8, Size - 15 + i, GetBit(bits, i));
            SetFunctionModule(8, Size - 8, true);
        }

        private void DrawVersion()
        {
            if (Version < 7) return;
            int rem = Version;
            for (int i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
            int bits = Version << 12 | rem;

            for (int i = 0; i < 18; i++)
            {
                bool color = GetBit(bits, i);
                int a = Size - 11 + i % 3;
                int b = i / 3;
                SetFunctionModule(a, b, color);
                SetFunctionModule(b, a, color);
            }
        }

        private void DrawFinderPattern(int x, int y)
        {
            for (int dy = -4; dy <= 4; dy++)
            {
                for (int dx = -4; dx <= 4; dx++)
                {
                    int dist = Math.Max(Math.Abs(dx), Math.Abs(dy));
                    int xx = x + dx, yy = y + dy;
                    if (xx >= 0 && xx < Size && yy >= 0 && yy < Size)
                        SetFunctionModule(xx, yy, dist != 2 && dist != 4);
                }
            }
        }

        private void DrawAlignmentPattern(int x, int y)
        {
            for (int dy = -2; dy <= 2; dy++)
                for (int dx = -2; dx <= 2; dx++)
                    SetFunctionModule(x + dx, y + dy, Math.Max(Math.Abs(dx), Math.Abs(dy)) != 1);
        }

        private void SetFunctionModule(int x, int y, bool isDark)
        {
            _modules[y][x] = isDark;
            _isFunction[y][x] = true;
        }

        private byte[] AddEccAndInterleave(byte[] data)
        {
            int ver = Version;
            int numBlocks = NUM_ERROR_CORRECTION_BLOCKS[(int)_ecc][ver];
            int blockEccLen = ECC_CODEWORDS_PER_BLOCK[(int)_ecc][ver];
            int rawCodewords = GetNumRawDataModules(ver) / 8;
            int numShortBlocks = numBlocks - rawCodewords % numBlocks;
            int shortBlockLen = rawCodewords / numBlocks;

            var blocks = new List<byte[]>();
            byte[] rsDiv = ReedSolomonComputeDivisor(blockEccLen);
            int k = 0;
            for (int i = 0; i < numBlocks; i++)
            {
                int len = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
                byte[] dat = new byte[len];
                Array.Copy(data, k, dat, 0, len);
                k += len;
                byte[] ecc = ReedSolomonComputeRemainder(dat, rsDiv);

                byte[] block;
                if (i < numShortBlocks)
                {
                    block = new byte[dat.Length + 1 + ecc.Length];
                    Array.Copy(dat, 0, block, 0, dat.Length);
                    Array.Copy(ecc, 0, block, dat.Length + 1, ecc.Length);
                }
                else
                {
                    block = new byte[dat.Length + ecc.Length];
                    Array.Copy(dat, 0, block, 0, dat.Length);
                    Array.Copy(ecc, 0, block, dat.Length, ecc.Length);
                }
                blocks.Add(block);
            }

            var result = new List<byte>();
            int blockLen0 = blocks[0].Length;
            for (int i = 0; i < blockLen0; i++)
            {
                for (int j = 0; j < blocks.Count; j++)
                {
                    if (i != shortBlockLen - blockEccLen || j >= numShortBlocks)
                        result.Add(blocks[j][i]);
                }
            }
            return result.ToArray();
        }

        private void DrawCodewords(byte[] data)
        {
            int i = 0;
            for (int right = Size - 1; right >= 1; right -= 2)
            {
                if (right == 6) right = 5;
                for (int vert = 0; vert < Size; vert++)
                {
                    for (int j = 0; j < 2; j++)
                    {
                        int x = right - j;
                        bool upward = ((right + 1) & 2) == 0;
                        int y = upward ? Size - 1 - vert : vert;
                        if (!_isFunction[y][x] && i < data.Length * 8)
                        {
                            _modules[y][x] = GetBit(data[i >> 3], 7 - (i & 7));
                            i++;
                        }
                    }
                }
            }
        }

        private void ApplyMask(int mask)
        {
            for (int y = 0; y < Size; y++)
            {
                for (int x = 0; x < Size; x++)
                {
                    bool invert;
                    switch (mask)
                    {
                        case 0: invert = (x + y) % 2 == 0; break;
                        case 1: invert = y % 2 == 0; break;
                        case 2: invert = x % 3 == 0; break;
                        case 3: invert = (x + y) % 3 == 0; break;
                        case 4: invert = (x / 3 + y / 2) % 2 == 0; break;
                        case 5: invert = x * y % 2 + x * y % 3 == 0; break;
                        case 6: invert = (x * y % 2 + x * y % 3) % 2 == 0; break;
                        case 7: invert = ((x + y) % 2 + x * y % 3) % 2 == 0; break;
                        default: throw new InvalidOperationException("Unreachable");
                    }
                    if (!_isFunction[y][x] && invert) _modules[y][x] = !_modules[y][x];
                }
            }
        }

        private int GetPenaltyScore()
        {
            int result = 0;

            for (int y = 0; y < Size; y++)
            {
                bool runColor = false;
                int runX = 0;
                int[] runHistory = new int[7];
                for (int x = 0; x < Size; x++)
                {
                    if (_modules[y][x] == runColor)
                    {
                        runX++;
                        if (runX == 5) result += PENALTY_N1;
                        else if (runX > 5) result++;
                    }
                    else
                    {
                        FinderPenaltyAddHistory(runX, runHistory);
                        if (!runColor) result += FinderPenaltyCountPatterns(runHistory) * PENALTY_N3;
                        runColor = _modules[y][x];
                        runX = 1;
                    }
                }
                result += FinderPenaltyTerminateAndCount(runColor, runX, runHistory) * PENALTY_N3;
            }
            for (int x = 0; x < Size; x++)
            {
                bool runColor = false;
                int runY = 0;
                int[] runHistory = new int[7];
                for (int y = 0; y < Size; y++)
                {
                    if (_modules[y][x] == runColor)
                    {
                        runY++;
                        if (runY == 5) result += PENALTY_N1;
                        else if (runY > 5) result++;
                    }
                    else
                    {
                        FinderPenaltyAddHistory(runY, runHistory);
                        if (!runColor) result += FinderPenaltyCountPatterns(runHistory) * PENALTY_N3;
                        runColor = _modules[y][x];
                        runY = 1;
                    }
                }
                result += FinderPenaltyTerminateAndCount(runColor, runY, runHistory) * PENALTY_N3;
            }

            for (int y = 0; y < Size - 1; y++)
            {
                for (int x = 0; x < Size - 1; x++)
                {
                    bool color = _modules[y][x];
                    if (color == _modules[y][x + 1] && color == _modules[y + 1][x] && color == _modules[y + 1][x + 1])
                        result += PENALTY_N2;
                }
            }

            int dark = 0;
            foreach (var row in _modules)
                foreach (var m in row)
                    if (m) dark++;
            int total = Size * Size;
            int k = (Math.Abs(dark * 20 - total * 10) + total - 1) / total - 1;
            result += k * PENALTY_N4;
            return result;
        }

        private int[] GetAlignmentPatternPositions()
        {
            if (Version == 1) return new int[0];
            int numAlign = Version / 7 + 2;
            int step = (Version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4) * 2;
            var result = new List<int> { 6 };
            for (int pos = Size - 7; result.Count < numAlign; pos -= step)
                result.Insert(1, pos);
            return result.ToArray();
        }

        private static int GetNumRawDataModules(int ver)
        {
            int result = (16 * ver + 128) * ver + 64;
            if (ver >= 2)
            {
                int numAlign = ver / 7 + 2;
                result -= (25 * numAlign - 10) * numAlign - 55;
                if (ver >= 7) result -= 36;
            }
            return result;
        }

        private static int GetNumDataCodewords(int ver, QrEcc ecl)
        {
            return GetNumRawDataModules(ver) / 8
                - ECC_CODEWORDS_PER_BLOCK[(int)ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[(int)ecl][ver];
        }

        private static int NumCharCountBits(int version)
        {
            return version <= 9 ? 8 : 16; // Byte mode only.
        }

        private static int FormatBitsForEcc(QrEcc ecl)
        {
            switch (ecl)
            {
                case QrEcc.Low: return 1;
                case QrEcc.Medium: return 0;
                case QrEcc.Quartile: return 3;
                case QrEcc.High: return 2;
                default: throw new ArgumentOutOfRangeException();
            }
        }

        private static byte[] ReedSolomonComputeDivisor(int degree)
        {
            byte[] result = new byte[degree];
            result[degree - 1] = 1;
            int root = 1;
            for (int i = 0; i < degree; i++)
            {
                for (int j = 0; j < result.Length; j++)
                {
                    result[j] = ReedSolomonMultiply(result[j], (byte)root);
                    if (j + 1 < result.Length) result[j] ^= result[j + 1];
                }
                root = ReedSolomonMultiply((byte)root, 0x02);
            }
            return result;
        }

        private static byte[] ReedSolomonComputeRemainder(byte[] data, byte[] divisor)
        {
            byte[] result = new byte[divisor.Length];
            foreach (byte b in data)
            {
                byte factor = (byte)(b ^ result[0]);
                Array.Copy(result, 1, result, 0, result.Length - 1);
                result[result.Length - 1] = 0;
                for (int i = 0; i < divisor.Length; i++)
                    result[i] ^= ReedSolomonMultiply(divisor[i], factor);
            }
            return result;
        }

        private static byte ReedSolomonMultiply(byte x, byte y)
        {
            int z = 0;
            for (int i = 7; i >= 0; i--)
            {
                z = (z << 1) ^ ((z >> 7) * 0x11D);
                z ^= ((y >> i) & 1) * x;
            }
            return (byte)z;
        }

        private int FinderPenaltyCountPatterns(int[] runHistory)
        {
            int n = runHistory[1];
            bool core = n > 0 && runHistory[2] == n && runHistory[3] == n * 3 && runHistory[4] == n && runHistory[5] == n;
            return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0)
                 + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
        }

        private int FinderPenaltyTerminateAndCount(bool currentRunColor, int currentRunLength, int[] runHistory)
        {
            if (currentRunColor)
            {
                FinderPenaltyAddHistory(currentRunLength, runHistory);
                currentRunLength = 0;
            }
            currentRunLength += Size;
            FinderPenaltyAddHistory(currentRunLength, runHistory);
            return FinderPenaltyCountPatterns(runHistory);
        }

        private void FinderPenaltyAddHistory(int currentRunLength, int[] runHistory)
        {
            if (runHistory[0] == 0) currentRunLength += Size;
            for (int k = runHistory.Length - 1; k > 0; k--) runHistory[k] = runHistory[k - 1];
            runHistory[0] = currentRunLength;
        }

        private static void AppendBits(int val, int len, List<int> bb)
        {
            for (int i = len - 1; i >= 0; i--) bb.Add((val >> i) & 1);
        }

        private static bool GetBit(int x, int i)
        {
            return ((x >> i) & 1) != 0;
        }

        private const int PENALTY_N1 = 3;
        private const int PENALTY_N2 = 3;
        private const int PENALTY_N3 = 40;
        private const int PENALTY_N4 = 10;

        // Row order: Low, Medium, Quartile, High. Index 0 per row is an unused
        // placeholder so index == version number.
        private static readonly int[][] ECC_CODEWORDS_PER_BLOCK = new[]
        {
            new[] { -1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30 },
            new[] { -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28 },
            new[] { -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30 },
            new[] { -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30 },
        };

        private static readonly int[][] NUM_ERROR_CORRECTION_BLOCKS = new[]
        {
            new[] { -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25 },
            new[] { -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49 },
            new[] { -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68 },
            new[] { -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81 },
        };
    }
}
