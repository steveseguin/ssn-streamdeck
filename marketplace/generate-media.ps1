Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$pluginRoot = Join-Path $root "ssn-streamdeck\plugin\imgs"
$outputRoot = $PSScriptRoot

function New-RoundedPath {
	param(
		[float]$X,
		[float]$Y,
		[float]$Width,
		[float]$Height,
		[float]$Radius
	)

	$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
	$diameter = $Radius * 2
	$path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
	$path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
	$path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
	$path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
	$path.CloseFigure()
	return $path
}

function Fill-RoundedRectangle {
	param(
		[System.Drawing.Graphics]$Graphics,
		[System.Drawing.Brush]$Brush,
		[float]$X,
		[float]$Y,
		[float]$Width,
		[float]$Height,
		[float]$Radius
	)

	$path = New-RoundedPath $X $Y $Width $Height $Radius
	$Graphics.FillPath($Brush, $path)
	$path.Dispose()
}

function Draw-RoundedRectangle {
	param(
		[System.Drawing.Graphics]$Graphics,
		[System.Drawing.Pen]$Pen,
		[float]$X,
		[float]$Y,
		[float]$Width,
		[float]$Height,
		[float]$Radius
	)

	$path = New-RoundedPath $X $Y $Width $Height $Radius
	$Graphics.DrawPath($Pen, $path)
	$path.Dispose()
}

function Draw-ImageFit {
	param(
		[System.Drawing.Graphics]$Graphics,
		[string]$Path,
		[float]$X,
		[float]$Y,
		[float]$Width,
		[float]$Height
	)

	$image = [System.Drawing.Image]::FromFile($Path)
	try {
		$scale = [Math]::Min($Width / $image.Width, $Height / $image.Height)
		$drawWidth = $image.Width * $scale
		$drawHeight = $image.Height * $scale
		$drawX = $X + (($Width - $drawWidth) / 2)
		$drawY = $Y + (($Height - $drawHeight) / 2)
		$Graphics.DrawImage($image, $drawX, $drawY, $drawWidth, $drawHeight)
	} finally {
		$image.Dispose()
	}
}

function New-MediaCanvas {
	param(
		[string]$TopColor = "#111827",
		[string]$BottomColor = "#07111F"
	)

	$bitmap = [System.Drawing.Bitmap]::new(1920, 960)
	$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
	$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
	$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
	$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
	$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

	$rect = [System.Drawing.Rectangle]::new(0, 0, 1920, 960)
	$gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
		$rect,
		[System.Drawing.ColorTranslator]::FromHtml($TopColor),
		[System.Drawing.ColorTranslator]::FromHtml($BottomColor),
		35
	)
	$graphics.FillRectangle($gradient, $rect)
	$gradient.Dispose()

	return [PSCustomObject]@{
		Bitmap = $bitmap
		Graphics = $graphics
	}
}

function Save-MediaCanvas {
	param(
		[object]$Canvas,
		[string]$Name
	)

	$Canvas.Bitmap.Save(
		(Join-Path $outputRoot $Name),
		[System.Drawing.Imaging.ImageFormat]::Png
	)
	$Canvas.Graphics.Dispose()
	$Canvas.Bitmap.Dispose()
}

function New-Font {
	param(
		[float]$Size,
		[System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular
	)

	return [System.Drawing.Font]::new("Segoe UI", $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-Text {
	param(
		[System.Drawing.Graphics]$Graphics,
		[string]$Text,
		[System.Drawing.Font]$Font,
		[string]$Color,
		[float]$X,
		[float]$Y,
		[float]$Width,
		[float]$Height,
		[System.Drawing.StringAlignment]$Alignment = [System.Drawing.StringAlignment]::Near
	)

	$brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($Color))
	$format = [System.Drawing.StringFormat]::new()
	$format.Alignment = $Alignment
	$format.LineAlignment = [System.Drawing.StringAlignment]::Center
	$format.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
	$Graphics.DrawString($Text, $Font, $brush, [System.Drawing.RectangleF]::new($X, $Y, $Width, $Height), $format)
	$format.Dispose()
	$brush.Dispose()
}

function Draw-Pill {
	param(
		[System.Drawing.Graphics]$Graphics,
		[string]$Text,
		[float]$X,
		[float]$Y,
		[float]$Width,
		[string]$Color = "#59A5FF"
	)

	$background = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(38, 89, 165, 255))
	$border = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($Color), 2)
	Fill-RoundedRectangle $Graphics $background $X $Y $Width 54 27
	Draw-RoundedRectangle $Graphics $border $X $Y $Width 54 27
	$font = New-Font 22 ([System.Drawing.FontStyle]::Bold)
	Draw-Text $Graphics $Text $font "#DCEBFF" $X $Y $Width 54 ([System.Drawing.StringAlignment]::Center)
	$font.Dispose()
	$border.Dispose()
	$background.Dispose()
}

function Draw-TimerTouchStrip {
	param([System.Drawing.Graphics]$Graphics, [float]$X, [float]$Y)

	$strip = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#0F172A"))
	$bar = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#253247"))
	$fill = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#38BDF8"))
	Fill-RoundedRectangle $Graphics $strip $X $Y 570 260 20
	$title = New-Font 22 ([System.Drawing.FontStyle]::Bold)
	$value = New-Font 70 ([System.Drawing.FontStyle]::Bold)
	$hint = New-Font 20 ([System.Drawing.FontStyle]::Bold)
	Draw-Text $Graphics "STREAM TIMER" $title "#CBD5E1" ($X + 22) ($Y + 12) 250 35
	Draw-Text $Graphics "RUNNING" $title "#5EEAD4" ($X + 300) ($Y + 12) 248 35 ([System.Drawing.StringAlignment]::Far)
	Draw-Text $Graphics "02:35" $value "#FFFFFF" ($X + 20) ($Y + 48) 530 105 ([System.Drawing.StringAlignment]::Center)
	Fill-RoundedRectangle $Graphics $bar ($X + 22) ($Y + 166) 526 18 9
	Fill-RoundedRectangle $Graphics $fill ($X + 22) ($Y + 166) 326 18 9
	$timerHint = "TURN " + [char]0x00B1 + "10s   PUSH toggle   TOUCH HOLD reset"
	Draw-Text $Graphics $timerHint $hint "#94A3B8" ($X + 22) ($Y + 198) 526 40 ([System.Drawing.StringAlignment]::Center)
	$title.Dispose(); $value.Dispose(); $hint.Dispose(); $strip.Dispose(); $bar.Dispose(); $fill.Dispose()
}

function Draw-ChatTouchStrip {
	param([System.Drawing.Graphics]$Graphics, [float]$X, [float]$Y)

	$strip = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#0F172A"))
	Fill-RoundedRectangle $Graphics $strip $X $Y 570 260 20
	$meta = New-Font 22 ([System.Drawing.FontStyle]::Bold)
	$message = New-Font 34 ([System.Drawing.FontStyle]::Bold)
	$hint = New-Font 20 ([System.Drawing.FontStyle]::Bold)
	Draw-Text $Graphics "YOUTUBE" $meta "#5EEAD4" ($X + 22) ($Y + 12) 220 35
	Draw-Text $Graphics "Ava" $meta "#E2E8F0" ($X + 300) ($Y + 12) 248 35 ([System.Drawing.StringAlignment]::Far)
	Draw-Text $Graphics "Thanks for joining the stream!" $message "#FFFFFF" ($X + 22) ($Y + 47) 526 100
	Draw-Text $Graphics "1/12   TURN browse   PRESS pin" $hint "#94A3B8" ($X + 22) ($Y + 160) 526 35 ([System.Drawing.StringAlignment]::Center)
	Draw-Text $Graphics "TAP feature   HOLD unpin" $hint "#94A3B8" ($X + 22) ($Y + 202) 526 35 ([System.Drawing.StringAlignment]::Center)
	$meta.Dispose(); $message.Dispose(); $hint.Dispose(); $strip.Dispose()
}

$white = "#F8FAFC"
$muted = "#AFC0D6"
$blue = "#59A5FF"
$teal = "#4CD3BE"
$panel = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(210, 24, 34, 50))
$panelSoft = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(160, 24, 34, 50))
$border = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(100, 148, 163, 184), 2)

# Marketplace app icon (required exact size)
$appIcon = [System.Drawing.Bitmap]::new(288, 288)
$appIconGraphics = [System.Drawing.Graphics]::FromImage($appIcon)
$appIconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$appIconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$appIconGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$appIconGraphics.Clear([System.Drawing.Color]::Transparent)
Draw-ImageFit $appIconGraphics (Join-Path $pluginRoot "plugin@2x.png") 0 0 288 288
$appIcon.Save((Join-Path $outputRoot "app-icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$appIconGraphics.Dispose()
$appIcon.Dispose()

# Marketplace thumbnail
$canvas = New-MediaCanvas "#172033" "#090F1B"
$g = $canvas.Graphics

$glow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(38, 76, 211, 190))
$g.FillEllipse($glow, 70, 165, 560, 560)
$glow.Dispose()
Draw-ImageFit $g (Join-Path $pluginRoot "plugin@2x.png") 120 200 470 470

$titleFont = New-Font 88 ([System.Drawing.FontStyle]::Bold)
$subFont = New-Font 39
$smallFont = New-Font 24 ([System.Drawing.FontStyle]::Bold)
Draw-Text $g "Social Stream Ninja" $titleFont $white 650 220 1120 120
Draw-Text $g "Native Stream Deck controls for live chat" $subFont $muted 655 350 1030 70
Draw-Text $g "CONTROL OVERLAYS, CHAT, QUEUES, POLLS AND MORE" $smallFont $teal 660 440 1020 60
Draw-Pill $g "KEYS" 660 545 155
Draw-Pill $g "DIALS" 835 545 175 $teal
Draw-Pill $g "APP + CHROME" 1030 545 285 "#FFC05A"

$iconPaths = @("connection@2x.png", "command@2x.png", "custom@2x.png", "timer@2x.png", "chat-feed@2x.png")
$iconX = 660
foreach ($icon in $iconPaths) {
	Fill-RoundedRectangle $g $panelSoft $iconX 665 150 150 28
	Draw-ImageFit $g (Join-Path $pluginRoot $icon) ($iconX + 16) 681 118 118
	$iconX += 175
}

$titleFont.Dispose()
$subFont.Dispose()
$smallFont.Dispose()
Save-MediaCanvas $canvas "thumbnail.png"

# Gallery 1: controls overview
$canvas = New-MediaCanvas "#0C1728" "#07101C"
$g = $canvas.Graphics
$heading = New-Font 70 ([System.Drawing.FontStyle]::Bold)
$body = New-Font 32
Draw-Text $g "Your stream controls, one tap away" $heading $white 100 65 1720 100 ([System.Drawing.StringAlignment]::Center)
Draw-Text $g "Build a Stream Deck layout around the Social Stream Ninja tools you use every show." $body $muted 180 165 1560 70 ([System.Drawing.StringAlignment]::Center)

$cards = @(
	@{ Icon = "connection@2x.png"; Title = "Quick setup"; Text = "Connect with the same session ID used by the desktop app or Chrome extension." },
	@{ Icon = "command@2x.png"; Title = "Preset controls"; Text = "Trigger credits, overlays, queues, polls, waitlists and chat actions." },
	@{ Icon = "custom@2x.png"; Title = "Custom commands"; Text = "Send advanced Social Stream Ninja actions from a dedicated key." }
)

$cardX = 95
foreach ($card in $cards) {
	Fill-RoundedRectangle $g $panel $cardX 285 550 560 34
	Draw-RoundedRectangle $g $border $cardX 285 550 560 34
	Draw-ImageFit $g (Join-Path $pluginRoot $card.Icon) ($cardX + 155) 325 240 240
	$cardTitle = New-Font 40 ([System.Drawing.FontStyle]::Bold)
	$cardBody = New-Font 27
	Draw-Text $g $card.Title $cardTitle $white ($cardX + 35) 585 480 60 ([System.Drawing.StringAlignment]::Center)
	Draw-Text $g $card.Text $cardBody $muted ($cardX + 45) 655 460 125 ([System.Drawing.StringAlignment]::Center)
	$cardTitle.Dispose()
	$cardBody.Dispose()
	$cardX += 590
}

$heading.Dispose()
$body.Dispose()
Save-MediaCanvas $canvas "gallery-controls.png"

# Gallery 2: setup workflow
$canvas = New-MediaCanvas "#15162B" "#09101D"
$g = $canvas.Graphics
$heading = New-Font 66 ([System.Drawing.FontStyle]::Bold)
$body = New-Font 31
Draw-Text $g "Connect in minutes" $heading $white 100 85 820 105
Draw-Text $g "Use the session ID already shown in Social Stream Ninja." $body $muted 105 200 760 90

$stepFont = New-Font 31 ([System.Drawing.FontStyle]::Bold)
$stepBody = New-Font 25
$stepY = 340
$steps = @(
	@{ Number = "1"; Title = "Copy the session ID"; Text = "Desktop app: Stream Deck Setup.`nChrome extension: Settings." },
	@{ Number = "2"; Title = "Paste and test"; Text = "Enter it once in Stream Deck and test the connection." }
)
foreach ($step in $steps) {
	$circle = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($blue))
	$g.FillEllipse($circle, 110, $stepY, 64, 64)
	$circle.Dispose()
	Draw-Text $g $step.Number $stepFont "#07111F" 110 $stepY 64 64 ([System.Drawing.StringAlignment]::Center)
	Draw-Text $g $step.Title $stepFont $white 205 ($stepY - 2) 600 45
	Draw-Text $g $step.Text $stepBody $muted 205 ($stepY + 44) 620 70
	$stepY += 220
}

Fill-RoundedRectangle $g $panel 1010 95 760 770 38
Draw-RoundedRectangle $g $border 1010 95 760 770 38
$statusBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 45, 55, 75))
Fill-RoundedRectangle $g $statusBrush 1060 145 660 120 22
$dotBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#F5B942"))
$g.FillEllipse($dotBrush, 1090, 180, 22, 22)
$dotBrush.Dispose()
$statusTitle = New-Font 28 ([System.Drawing.FontStyle]::Bold)
$statusBody = New-Font 21
Draw-Text $g "Enter a Social Stream Ninja session ID." $statusTitle $white 1135 157 545 44
Draw-Text $g "Desktop app or Chrome extension" $statusBody $muted 1135 201 530 42

$labelFont = New-Font 24 ([System.Drawing.FontStyle]::Bold)
Draw-Text $g "CONNECT SOCIAL STREAM NINJA" $labelFont $white 1070 305 620 55
Draw-Text $g "Session ID or overlay URL" $statusBody $muted 1070 365 620 45
$inputBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#0A111C"))
Fill-RoundedRectangle $g $inputBrush 1070 420 620 70 12
Draw-RoundedRectangle $g $border 1070 420 620 70 12
Draw-Text $g "Paste session ID or dock URL" $statusBody "#718096" 1090 425 580 60

$buttonBlue = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#2668B9"))
$buttonDark = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#2D3748"))
Fill-RoundedRectangle $g $buttonBlue 1070 540 295 72 12
Fill-RoundedRectangle $g $buttonDark 1395 540 295 72 12
Draw-Text $g "Test Connection" $labelFont $white 1070 540 295 72 ([System.Drawing.StringAlignment]::Center)
Draw-Text $g "Show ID" $labelFont $white 1395 540 295 72 ([System.Drawing.StringAlignment]::Center)

Fill-RoundedRectangle $g $panelSoft 1070 665 620 115 18
Draw-Text $g "Desktop app source controls appear automatically when available." $statusBody $teal 1100 675 560 95 ([System.Drawing.StringAlignment]::Center)

$heading.Dispose()
$body.Dispose()
$stepFont.Dispose()
$stepBody.Dispose()
$statusBrush.Dispose()
$statusTitle.Dispose()
$statusBody.Dispose()
$labelFont.Dispose()
$inputBrush.Dispose()
$buttonBlue.Dispose()
$buttonDark.Dispose()
Save-MediaCanvas $canvas "gallery-setup.png"

# Gallery 3: Stream Deck + controls
$canvas = New-MediaCanvas "#0B2026" "#071019"
$g = $canvas.Graphics
$heading = New-Font 68 ([System.Drawing.FontStyle]::Bold)
$body = New-Font 31
Draw-Text $g "Built for keys and dials" $heading $white 100 65 1720 100 ([System.Drawing.StringAlignment]::Center)
Draw-Text $g "Get live feedback and quick control on Stream Deck and Stream Deck +." $body $muted 200 165 1520 70 ([System.Drawing.StringAlignment]::Center)

$featureCards = @(
	@{ Type = "timer"; Icon = "timer@2x.png"; X = 175; Title = "Timer Dial"; Text = "Adjust and monitor the timer with live status." },
	@{ Type = "chat"; Icon = "chat-feed@2x.png"; X = 1035; Title = "Chat Review"; Text = "Browse, pin, feature and unpin recent chat." }
)

foreach ($feature in $featureCards) {
	Fill-RoundedRectangle $g $panel $feature.X 285 710 610 40
	Draw-RoundedRectangle $g $border $feature.X 285 710 610 40
	if ($feature.Type -eq "timer") {
		Draw-TimerTouchStrip $g ($feature.X + 70) 335
	} else {
		Draw-ChatTouchStrip $g ($feature.X + 70) 335
	}
	Draw-ImageFit $g (Join-Path $pluginRoot $feature.Icon) ($feature.X + 70) 650 70 70
	$featureTitle = New-Font 48 ([System.Drawing.FontStyle]::Bold)
	$featureBody = New-Font 28
	Draw-Text $g $feature.Title $featureTitle $white ($feature.X + 160) 647 470 75
	Draw-Text $g $feature.Text $featureBody $muted ($feature.X + 70) 730 570 65
	Draw-Pill $g "STREAM DECK +" ($feature.X + 70) 820 250 $teal
	$featureTitle.Dispose()
	$featureBody.Dispose()
}

$heading.Dispose()
$body.Dispose()
Save-MediaCanvas $canvas "gallery-dials.png"

$panel.Dispose()
$panelSoft.Dispose()
$border.Dispose()

Write-Output "Marketplace media generated in $outputRoot"
