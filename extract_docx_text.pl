#!/usr/bin/perl
use strict;
use warnings;
use utf8;
binmode(STDOUT, ":utf8");

my $file = shift @ARGV;
open(my $fh, '<', $file) or die "Cannot open $file: $!";
my $content = do { local $/; <$fh> };
close $fh;

# Extract text content per paragraph, showing structure
my $para_num = 0;
while ($content =~ /<w:p\b[^>]*>(.*?)<\/w:p>/sg) {
    my $para = $1;
    my $text = '';
    while ($para =~ /<w:t[^>]*>([^<]*)<\/w:t>/g) {
        my $t = $1;
        $t =~ s/&#(\d+);/chr($1)/ge;
        $t =~ s/&amp;/&/g;
        $t =~ s/&lt;/</g;
        $t =~ s/&gt;/>/g;
        $t =~ s/&quot;/"/g;
        $t =~ s/&apos;/'/g;
        $text .= $t;
    }
    $para_num++;
    if ($text ne '') {
        print "P$para_num: $text\n";
    } else {
        print "P$para_num: (empty)\n";
    }
}
